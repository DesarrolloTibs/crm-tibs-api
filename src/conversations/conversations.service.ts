import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';
import { ChannelConfig } from './entities/channel-config.entity';
import { ConversationsGateway } from './conversations.gateway';
import { AiAgentService } from './ai-agent.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientsService } from '../clients/clients.service';
import { PhoneUtils } from '../common/utils/phone.utils';
import { NOTIFICATION_EVENTS } from '../common/events/notification.events';
import { CONVERSATION_EVENTS } from '../common/events/conversation.events';


@Injectable()
export class ConversationsService {
  private readonly logger = new Logger('ConversationsService');
  private aiDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ChannelConfig)
    private readonly channelConfigRepository: Repository<ChannelConfig>,
    private readonly gateway: ConversationsGateway,
    private readonly aiAgentService: AiAgentService,
    private readonly eventEmitter: EventEmitter2,
    private readonly clientsService: ClientsService,
  ) {}

  /**
   * Lista las conversaciones activas.
   * Filtra por ejecutivo asignado si no es administrador.
   */
  async findAll(userId?: string, isAdmin: boolean = false): Promise<any[]> {
    const query = this.conversationRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.client', 'client')
      .leftJoinAndSelect('c.assignedUser', 'assignedUser');

    if (!isAdmin && userId) {
      query.where('c.assignedUserId = :userId', { userId });
    }

    const conversations = await query.orderBy('c.updatedAt', 'DESC').getMany();

    if (conversations.length === 0) {
      return [];
    }

    // Cargar usuarios asignados desde public.users si no están en el esquema local del tenant
    const missingUserIds = conversations
      .filter((c) => c.assignedUserId && !c.assignedUser)
      .map((c) => c.assignedUserId);

    if (missingUserIds.length > 0) {
      try {
        const publicUsers: any[] = await this.conversationRepository.manager.query(
          `SELECT id, username, email, role, "isActive" FROM public.users WHERE id::text IN (${missingUserIds.map((_, i) => `$${i + 1}`).join(',')})`,
          missingUserIds
        );
        const publicUserMap = new Map(publicUsers.map((u) => [u.id, u]));

        for (const conv of conversations) {
          if (conv.assignedUserId && !conv.assignedUser && publicUserMap.has(conv.assignedUserId)) {
            conv.assignedUser = publicUserMap.get(conv.assignedUserId);
          }
        }
      } catch (err) {
        this.logger.warn(`No se pudieron cargar usuarios de public.users: ${err.message}`);
      }
    }



    const conversationIds = conversations.map((c) => c.id);

    // Obtener el último mensaje de todas las conversaciones en una sola consulta para evitar N+1 queries y deadlocks
    const lastMessages = await this.messageRepository.createQueryBuilder('m')
      .leftJoinAndSelect('m.senderUser', 'senderUser')
      .where('m.conversationId IN (:...conversationIds)', { conversationIds })
      .orderBy('m.createdAt', 'DESC')
      .getMany();

    const lastMessageMap = new Map<string, Message>();
    for (const msg of lastMessages) {
      if (!lastMessageMap.has(msg.conversationId)) {
        lastMessageMap.set(msg.conversationId, msg);
      }
    }

    return conversations.map((conv) => ({
      ...conv,
      lastMessage: lastMessageMap.get(conv.id) || null,
    }));
  }



  private formatMessageContent(content: string): string {
    if (!content) return content;
    const baseUrl = (process.env.API_URL || process.env.PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '');

    let formatted = content;

    // 1. Formatear cualquier ruta relativa de uploads a URL absoluta
    formatted = formatted.replace(/(:\s*|\(\s*|\s+)(\/)?uploads\//gi, (match, prefix) => {
      return `${prefix || ''}${baseUrl}/uploads/`;
    });

    return formatted;
  }

  /**
   * Obtiene los mensajes de una conversación específica.
   */
  async findMessages(conversationId: string): Promise<Message[]> {
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      relations: ['senderUser'],
    });
    return messages.map((m) => {
      if (m.content) {
        m.content = this.formatMessageContent(m.content);
      }
      return m;
    });
  }

  /**
   * Enlaza automáticamente conversaciones huérfanas de un cliente por su número telefónico o correo.
   */
  async autoLinkClientConversations(clientId: string, phone?: string | null): Promise<void> {
    if (!clientId || !phone) return;
    try {
      const variants = PhoneUtils.getPhoneVariants(phone);
      const suffix = PhoneUtils.extractSubscriberSuffix(phone);
      if (variants.length === 0) return;

      const qb = this.conversationRepository.createQueryBuilder()
        .update(Conversation)
        .set({ clientId })
        .where('clientId IS NULL');

      qb.andWhere(new Brackets((inner) => {
        inner.where('externalId IN (:...variants)', { variants });
        if (suffix && suffix.length >= 8) {
          inner.orWhere("REGEXP_REPLACE(externalId, '[^0-9]', '', 'g') LIKE :suffix", { suffix: `%${suffix}` });
        }
      }));

      await qb.execute();
    } catch (err: any) {
      this.logger.warn(`No se pudieron auto-vincular conversaciones para cliente ${clientId}: ${err.message}`);
    }
  }

  /**
   * Obtiene una conversación por canal e ID externo (por ejemplo, visitorId de webchat).
   */
  async findByChannelAndExternalId(channel: string, externalId: string): Promise<Conversation | null> {
    return this.conversationRepository.findOne({ where: { channel, externalId }, relations: ['client'] });
  }

  /**
   * Registra y procesa un mensaje entrante (simulado o webhook real de Meta).
   */
  async receiveIncomingMessage(
    channel: string,
    externalId: string,
    clientNickname: string,
    text: string,
    channelConfigId?: string,
  ): Promise<Message> {
    // 1. Buscar o crear la conversación
    let conversation = await this.conversationRepository.findOne({
      where: { channel, externalId },
    });

    if (!conversation) {
      const config = await this.aiAgentService.getOrInitConfig();
      
      // Intentar resolver cliente existente por teléfono en WhatsApp usando búsqueda inteligente de variantes
      let linkedClientId: string | null = null;
      if (channel === 'whatsapp') {
        const existingClient = await this.clientsService.findByPhone(externalId);
        if (existingClient) {
          linkedClientId = existingClient.id;
          clientNickname = `${existingClient.nombre} ${existingClient.apellido || ''}`.trim();
        } else {
          // Crear nuevo contacto para WhatsApp
          const newClient = this.clientRepository.create({
            nombre: clientNickname,
            apellido: '',
            correo: null,
            telefono: externalId,
            ejecutivo_id: config.defaultUserId || undefined,
          });
          const savedClient: Client = await this.clientRepository.save(newClient) as unknown as Client;
          linkedClientId = savedClient.id;
        }
      } else {
        // Para Messenger/Instagram crear nuevo contacto inicial
        const newClient = this.clientRepository.create({
          nombre: clientNickname,
          apellido: '',
          correo: null,
          telefono: null,
          ejecutivo_id: config.defaultUserId || undefined,
        });
        const savedClient: Client = await this.clientRepository.save(newClient) as unknown as Client;
        linkedClientId = savedClient.id;
      }

      conversation = this.conversationRepository.create({
        channel,
        externalId,
        clientName: clientNickname,
        clientId: linkedClientId,
        assignedUserId: config.defaultUserId,
        botActive: true,
        channelConfigId: channelConfigId || null,
      });
      conversation = await this.conversationRepository.save(conversation);
    }

    // 2. Guardar mensaje entrante del cliente
    const incomingMessage = this.messageRepository.create({
      conversationId: conversation.id,
      sender: 'contact',
      content: text,
    });
    const savedIncoming = await this.messageRepository.save(incomingMessage);
    this.gateway.emitMessage(savedIncoming);

    // Actualizar timestamp de conversación
    conversation.updatedAt = new Date();
    await this.conversationRepository.save(conversation);

    // 3. Si el bot está activo, programar el procesamiento de IA con Debounce de 7 segundos
    if (conversation.botActive) {
      this.scheduleAiReplyDebounce(conversation.id);
    }

    return savedIncoming;
  }

  /**
   * Programa la respuesta de la IA con una ventana de espera (Debounce) de 7 segundos.
   * Si el cliente envía otro mensaje dentro de los 7s, el temporizador se reinicia.
   */
  private scheduleAiReplyDebounce(conversationId: string) {
    const tenantSchema = TenantContextService.getTenantSchema();
    const existingTimer = this.aiDebounceTimers.get(conversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.logger.log(`[DEBOUNCE 7s] Mensaje consecutivo recibido en chat ${conversationId}. Reiniciando temporizador de 7s...`);
    } else {
      this.logger.log(`[DEBOUNCE 7s] Iniciando ventana de espera de 7s para chat ${conversationId}...`);
    }

    const timer = setTimeout(async () => {
      this.aiDebounceTimers.delete(conversationId);
      this.logger.log(`[DEBOUNCE 7s EXPIRED] Ejecutando IA para chat ${conversationId} tras 7s de inactividad.`);
      await TenantContextService.run({ tenantSchema }, async () => {
        await this.triggerAiReplyById(conversationId);
      });
    }, 7000);

    this.aiDebounceTimers.set(conversationId, timer);
  }

  /**
   * Ejecuta el procesamiento de respuesta de IA obteniendo la conversación e historial actualizado.
   */
  private async triggerAiReplyById(conversationId: string) {
    const conversation = await this.conversationRepository.findOne({ where: { id: conversationId } });
    if (!conversation || !conversation.botActive) {
      this.logger.log(`[DEBOUNCE] Chat ${conversationId} deshabilitado o no encontrado. Cancelando respuesta.`);
      return;
    }

    const lastContactMessage = await this.messageRepository.findOne({
      where: { conversationId, sender: 'contact' },
      order: { createdAt: 'DESC' },
    });

    if (!lastContactMessage) return;

    await this.triggerAiReply(conversation, lastContactMessage.content);
  }

  /**
   * Ejecuta el razonamiento del Agente IA en segundo plano y responde.
   */
  private async triggerAiReply(conversation: Conversation, text: string) {
    try {
      const result = await this.aiAgentService.processIncomingMessage(conversation, text);
      const { reply, route, isHandedOff } = result;

      // ── Bloqueo por suscripción: no enviar mensaje, solo notificación in-app y correo ──
      if (route === 'subscription_blocked') {
        const subscriptionCode = (result as any).subscriptionCode || 'SUBSCRIPTION_ERROR';
        const subscriptionPayload = (result as any).subscriptionPayload || {};

        let notifTitle = '⚠️ Límite de Suscripción Alcanzado';
        let notifMessage = 'El asistente de IA no pudo procesar un mensaje entrante porque se alcanzó un límite de la suscripción.';

        if (subscriptionCode === 'TOKENS_LIMIT_EXCEEDED') {
          const used = subscriptionPayload.tokens_used?.toLocaleString() || '—';
          const limit = subscriptionPayload.tokens_limit?.toLocaleString() || '—';
          notifTitle = '⚠️ Límite de Tokens de IA Alcanzado';
          notifMessage = `Se ha alcanzado el límite de tokens de IA del plan actual (${used} / ${limit} tokens). Los mensajes entrantes no serán procesados por la IA hasta que se renueve o amplíe la suscripción.`;
        } else if (subscriptionCode === 'SUBSCRIPTION_EXPIRED') {
          notifTitle = '🚫 Suscripción Expirada';
          notifMessage = 'La suscripción de la organización ha expirado. Los mensajes entrantes no serán procesados por la IA hasta que se renueve el plan.';
        } else if (subscriptionCode === 'PLAN_NOT_ASSIGNED') {
          notifTitle = '📋 Plan No Asignado';
          notifMessage = 'La organización no cuenta con un plan de suscripción asignado. Los mensajes entrantes no serán procesados por la IA.';
        }

        // Notificar a TODOS los administradores del tenant vía notificación in-app + correo
        const adminUsers = await this.userRepository.find({ where: { role: Role.Admin, isActive: true } });
        for (const admin of adminUsers) {
          this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE_AND_SEND, {
            userId: admin.id,
            title: notifTitle,
            message: notifMessage,
            type: 'subscription_limit',
            entityId: undefined,
            sendEmail: true,
          });
        }

        this.logger.warn(`[Subscription] Notificación enviada a ${adminUsers.length} admin(s) del tenant por bloqueo de IA (${subscriptionCode}).`);
        return; // No enviar nada al chat
      }

      if (reply && reply.trim() !== '') {
        const botMessage = this.messageRepository.create({
          conversationId: conversation.id,
          sender: 'agent',
          content: reply,
        });
        const savedBot = await this.messageRepository.save(botMessage);
        
        // Envío real o simulado inteligente
        await this.sendOutboundMessage(conversation, reply);

        const fullBotMessage = await this.messageRepository.findOne({
          where: { id: savedBot.id },
          relations: ['conversation'],
        });

        this.gateway.emitMessage(fullBotMessage || savedBot);

        // Actualizar timestamp
        conversation.updatedAt = new Date();
        await this.conversationRepository.save(conversation);
      }

      // Si la IA identificó una derivación a ejecutivo especializado o soporte
      if (isHandedOff) {
        this.logger.log(`Derivación a ejecutivo especializado solicitada en chat ${conversation.id}. Deshabilitando Bot IA...`);

        // 1. Deshabilitar bot en la conversación
        conversation.botActive = false;
        conversation.updatedAt = new Date();
        await this.conversationRepository.save(conversation);

        // 2. Emitir evento de cambio de estado del bot por WebSocket
        this.gateway.emitBotStatusChanged(conversation.id, false);

        // 3. Crear mensaje de auditoría de sistema
        const systemMsg = this.messageRepository.create({
          conversationId: conversation.id,
          sender: 'system',
          content: 'El bot de IA se deshabilitó automáticamente al derivar la conversación con un ejecutivo especializado.',
        });
        const savedSys = await this.messageRepository.save(systemMsg);
        this.gateway.emitMessage(savedSys);

        // 4. Notificar al ejecutivo asignado (o a los administradores si está sin asignar)
        const clientName = conversation.client 
          ? `${conversation.client.nombre || ''} ${conversation.client.apellido || ''}`.trim() 
          : (conversation.clientName || conversation.externalId || 'Contacto');

        const notificationTitle = '💬 Derivación de Chat: Ejecutivo Especializado';
        const notificationMessage = `El cliente ${clientName} ha sido derivado en el chat para recibir atención de un ejecutivo especializado.`;

        if (conversation.assignedUserId) {
          this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE_AND_SEND, {
            userId: conversation.assignedUserId,
            title: notificationTitle,
            message: notificationMessage,
            type: 'conversation_escalated',
            entityId: conversation.id,
            sendEmail: true,
          });
        } else {
          // Notificar a administradores si no hay un ejecutivo asignado
          const adminUsers = await this.userRepository.find({ where: { role: Role.Admin, isActive: true } });
          for (const admin of adminUsers) {
            this.eventEmitter.emit(NOTIFICATION_EVENTS.CREATE_AND_SEND, {
              userId: admin.id,
              title: notificationTitle,
              message: notificationMessage,
              type: 'conversation_escalated',
              entityId: conversation.id,
              sendEmail: false,
            });
          }
        }
      }
    } catch (err) {
      this.logger.error(`Error en respuesta automática de IA para chat ${conversation.id}:`, err);
    }
  }

  /**
   * Envía un mensaje manual (intervención humana) desde la plataforma.
   */
  async sendManualMessage(conversationId: string, senderUserId: string, content: string): Promise<Message> {
    const conversation = await this.conversationRepository.findOne({ where: { id: conversationId } });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada.');
    }

    // Cancelar cualquier respuesta de IA pendiente por debounce si el ejecutivo interviene
    if (this.aiDebounceTimers.has(conversationId)) {
      clearTimeout(this.aiDebounceTimers.get(conversationId));
      this.aiDebounceTimers.delete(conversationId);
      this.logger.log(`[DEBOUNCE CANCELLED] Intervención humana manual en chat ${conversationId}. Temporizador cancelado.`);
    }

    // Validar si el senderUserId existe en el esquema del tenant
    let validSenderUserId: string | null = null;
    if (senderUserId) {
      const userExists = await this.userRepository.findOne({ where: { id: senderUserId } });
      if (userExists) validSenderUserId = senderUserId;
    }

    // Guardar el mensaje manual
    const manualMessage = this.messageRepository.create({
      conversationId,
      sender: 'user', // Identifica intervención humana del ejecutivo
      senderUserId: validSenderUserId,
      content,
    });
    const saved = await this.messageRepository.save(manualMessage);

    // Cargar relaciones para emitir perfil del usuario emisor
    const fullMessage = await this.messageRepository.findOne({
      where: { id: saved.id },
      relations: ['senderUser'],
    });

    this.gateway.emitMessage(fullMessage!);

    // Envío real o simulado inteligente
    await this.sendOutboundMessage(conversation, content);

    // Actualizar timestamp
    conversation.updatedAt = new Date();
    await this.conversationRepository.save(conversation);

    return fullMessage!;
  }

  /**
   * Modifica el estatus de activación del Bot en una conversación.
   */
  async toggleBotStatus(conversationId: string, botActive: boolean, triggerUserId: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({ where: { id: conversationId } });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada.');
    }

    conversation.botActive = botActive;
    const updated = await this.conversationRepository.save(conversation);

    // Obtener detalles del usuario que lo cambió en el esquema del tenant
    let validSenderUserId: string | null = null;
    let userName = 'Sistema';

    if (triggerUserId) {
      const user = await this.userRepository.findOne({ where: { id: triggerUserId } });
      if (user) {
        validSenderUserId = triggerUserId;
        userName = `${user.username}`;
      }
    }

    // Registrar mensaje de auditoría de sistema
    const auditMessage = this.messageRepository.create({
      conversationId,
      sender: 'system',
      senderUserId: validSenderUserId,
      content: `El bot ha sido ${botActive ? 'activado' : 'desactivado'} por el ejecutivo ${userName}.`,
    });
    const savedAudit = await this.messageRepository.save(auditMessage);
    const fullAudit = await this.messageRepository.findOne({
      where: { id: savedAudit.id },
      relations: ['senderUser'],
    });

    // Notificar en tiempo real
    this.gateway.emitBotStatusChanged(conversationId, botActive);
    this.gateway.emitMessage(fullAudit!);

    return updated;
  }


  /**
   * Reasigna la conversación a otro ejecutivo.
   */
  async assignUser(conversationId: string, assignedUserId: string | null, triggerUserId: string): Promise<Conversation> {

    const conversation = await this.conversationRepository.findOne({ where: { id: conversationId } });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada.');
    }

    const cleanTargetId = (assignedUserId && assignedUserId.trim().length > 0) ? assignedUserId.trim() : null;

    // Regla de Negocio: Una conversación asignada previa no puede volver a quedar sin asignación
    if (conversation.assignedUserId && !cleanTargetId) {
      throw new BadRequestException('Una conversación asignada previamente no puede quedar sin ejecutivo asignado.');
    }

    let previousUser: any = conversation.assignedUserId 
      ? await this.userRepository.findOne({ where: { id: conversation.assignedUserId } })
      : null;
    if (conversation.assignedUserId && !previousUser) {
      try {
        const pUsers = await this.conversationRepository.manager.query(
          `SELECT id, username, email, role, "isActive" FROM public.users WHERE id::text = $1 OR LOWER(username) = LOWER($1)`,
          [conversation.assignedUserId]
        );
        if (pUsers && pUsers.length > 0) previousUser = pUsers[0];
      } catch (err) {}
    }

    let newUser: any = null;
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';

    if (cleanTargetId) {
      newUser = await this.userRepository.findOne({ where: { id: cleanTargetId } });
      if (!newUser) {
        newUser = await this.userRepository.createQueryBuilder('u')
          .where('u.id::text = :id OR LOWER(u.username) = LOWER(:id)', { id: cleanTargetId })
          .getOne();
      }

      if (tenantSchema !== 'public') {
        const isSuper = newUser && (newUser.role === 'superadmin' || (newUser as any).role === 'SuperAdmin');
        if (isSuper) {
          throw new BadRequestException('Los usuarios SuperAdmin solo se pueden asignar en la Organización Global (public).');
        }
      } else if (!newUser) {
        try {
          const publicUsers = await this.conversationRepository.manager.query(
            `SELECT id, username, email, password, role, "isActive" FROM public.users WHERE id::text = $1 OR LOWER(username) = LOWER($1)`,
            [cleanTargetId]
          );
          if (publicUsers && publicUsers.length > 0) {
            const pubUser = publicUsers[0];
            await this.conversationRepository.manager.query(
              `INSERT INTO users (id, username, email, password, role, "isActive") 
               VALUES ($1, $2, $3, $4, $5, $6) 
               ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email, role = EXCLUDED.role, "isActive" = EXCLUDED."isActive"`,
              [pubUser.id, pubUser.username, pubUser.email, pubUser.password || 'system_synced', pubUser.role || 'superadmin', pubUser.isActive ?? true]
            );
            newUser = await this.userRepository.findOne({ where: { id: pubUser.id } }) || pubUser;
          }
        } catch (err) {
          this.logger.warn(`No se pudo sincronizar usuario global de public.users a la tabla local: ${err.message}`);
        }
      }
    }


    if (cleanTargetId && !newUser) {
      this.logger.error(`[assignUser] No se encontró usuario en ningún esquema para target: '${cleanTargetId}'`);
      throw new NotFoundException(`El usuario con ID o nombre '${cleanTargetId}' no existe en el sistema.`);
    }

    const finalTargetId = newUser ? newUser.id : cleanTargetId;

    // Sincronizar triggerUser a la tabla de usuarios local si es SuperAdmin global
    if (triggerUserId) {
      const localTrigger = await this.userRepository.findOne({ where: { id: triggerUserId } });
      if (!localTrigger) {
        try {
          const pubTriggers = await this.conversationRepository.manager.query(
            `SELECT id, username, email, password, role, "isActive" FROM public.users WHERE id::text = $1 OR LOWER(username) = LOWER($1)`,
            [triggerUserId]
          );
          if (pubTriggers && pubTriggers.length > 0) {
            const pubT = pubTriggers[0];
            await this.conversationRepository.manager.query(
              `INSERT INTO users (id, username, email, password, role, "isActive") 
               VALUES ($1, $2, $3, $4, $5, $6) 
               ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email, role = EXCLUDED.role, "isActive" = EXCLUDED."isActive"`,
              [pubT.id, pubT.username, pubT.email, pubT.password || 'system_synced', pubT.role || 'superadmin', pubT.isActive ?? true]
            );
          }
        } catch (err) {}
      }
    }



    const triggerUser = triggerUserId
      ? await this.userRepository.findOne({ where: { id: triggerUserId } })
      : null;
    const triggerUserName = triggerUser ? triggerUser.username : 'Sistema';

    conversation.assignedUserId = finalTargetId;
    conversation.assignedUser = newUser;
    const updated = await this.conversationRepository.save(conversation);




    // Registrar mensaje de auditoría de sistema si hubo cambio de estado real
    let auditContent: string | null = null;
    if (newUser) {
      auditContent = previousUser
        ? `Conversación reasignada de ${previousUser.username} a ${newUser.username} por ${triggerUserName}.`
        : `Conversación asignada a ${newUser.username} por ${triggerUserName}.`;
    } else if (previousUser) {
      auditContent = `Conversación desasignada de ${previousUser.username} por ${triggerUserName}.`;
    }

    if (auditContent) {
      const auditMessage = this.messageRepository.create({
        conversationId,
        sender: 'system',
        senderUserId: triggerUser ? triggerUser.id : null,
        content: auditContent,
      });

      const savedAudit = await this.messageRepository.save(auditMessage);
      const fullAudit = await this.messageRepository.findOne({
        where: { id: savedAudit.id },
        relations: ['senderUser'],
      });

      this.gateway.emitMessage(fullAudit!);
    }

    // Notificar en tiempo real cambio de asignación
    this.gateway.emitConversationAssigned(conversationId, conversation.assignedUserId);

    return updated;

  }

  // ── MÉTODOS CRUD DE CONFIGURACIÓN DE CANALES ───────────────────────────────

  async findChannels(): Promise<ChannelConfig[]> {
    return this.channelConfigRepository.find({ order: { createdAt: 'DESC' } });
  }

  async saveChannel(dto: Partial<ChannelConfig>): Promise<ChannelConfig> {
    if (dto.id) {
      const existing = await this.channelConfigRepository.findOne({ where: { id: dto.id } });
      if (!existing) throw new NotFoundException('Canal no encontrado');
      Object.assign(existing, dto);
      return this.channelConfigRepository.save(existing);
    } else {
      const newConfig = this.channelConfigRepository.create(dto);
      return this.channelConfigRepository.save(newConfig);
    }
  }

  async deleteChannel(id: string): Promise<void> {
    const existing = await this.channelConfigRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Canal no encontrado');
    await this.channelConfigRepository.remove(existing);
  }

  // ── VALIDACIÓN Y RECEPCIÓN DE WEBHOOKS DE META ─────────────────────────────

  async findTenantSchemaByChannelConfig(
    channel: string,
    criteria: { accountId?: string; phoneNumberId?: string }
  ): Promise<string | null> {
    const dbChannel = (channel === 'messenger') ? 'facebook' : channel;
    const tenants = await this.channelConfigRepository.manager.query(
      `SELECT schema_name FROM public.tenants WHERE is_active = true`
    );

    for (const t of tenants) {
      const schema = t.schema_name;
      try {
        let query = `SELECT id FROM "${schema}".channel_configs WHERE channel = $1 AND "isActive" = true`;
        const params: any[] = [dbChannel];

        if (criteria.accountId) {
          query += ` AND "accountId" = $2`;
          params.push(criteria.accountId);
        } else if (criteria.phoneNumberId) {
          query += ` AND "phoneNumberId" = $2`;
          params.push(criteria.phoneNumberId);
        } else {
          continue;
        }

        const res = await this.channelConfigRepository.manager.query(query, params);
        if (res && res.length > 0) {
          return schema;
        }
      } catch (err) {
        // En caso de que la tabla no exista en algún esquema
      }
    }
    return null;
  }

  async findTenantSchemaByVerifyToken(
    channel: string,
    verifyToken: string
  ): Promise<string | null> {
    const dbChannel = (channel === 'messenger') ? 'facebook' : channel;
    const tenants = await this.channelConfigRepository.manager.query(
      `SELECT schema_name FROM public.tenants WHERE is_active = true`
    );

    for (const t of tenants) {
      const schema = t.schema_name;
      try {
        const query = `SELECT id FROM "${schema}".channel_configs WHERE channel = $1 AND "verifyToken" = $2 AND "isActive" = true`;
        const res = await this.channelConfigRepository.manager.query(query, [dbChannel, verifyToken]);
        if (res && res.length > 0) {
          return schema;
        }
      } catch (err) {
        // En caso de que la tabla no exista en algún esquema
      }
    }
    return null;
  }

  async verifyMetaWebhook(channel: string, mode: string, token: string, challenge: string): Promise<string> {
    this.logger.log(`[Webhook ${channel.toUpperCase()}] Petición de verificación recibida. mode=${mode}, token=${token}, challenge=${challenge}`);
    
    if (mode === 'subscribe' && token) {
      const tenantSchema = await this.findTenantSchemaByVerifyToken(channel, token);
      if (tenantSchema) {
        return TenantContextService.run({ tenantSchema }, async () => {
          const dbChannel = (channel === 'messenger') ? 'facebook' : channel;
          const config = await this.channelConfigRepository.findOne({
            where: { channel: dbChannel, verifyToken: token, isActive: true },
          });
          if (config) {
            this.logger.log(`[Webhook ${channel.toUpperCase()}] Webhook verificado correctamente en esquema ${tenantSchema}`);
            return challenge;
          }
          throw new NotFoundException('Token de verificación inválido o canal inactivo');
        });
      }
    }
    this.logger.warn(`[Webhook ${channel.toUpperCase()}] Falló intento de verificación de webhook`);
    throw new NotFoundException('Token de verificación inválido o canal inactivo');
  }

  async handleIncomingWebhook(channel: string, payload: any): Promise<any> {
    this.logger.log(`[Webhook ${channel.toUpperCase()}] Recibido body: ${JSON.stringify(payload)}`);

    let tenantSchema = 'public';
    let criteria: { accountId?: string; phoneNumberId?: string } = {};

    if (channel === 'whatsapp') {
      const entry = payload.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (phoneNumberId) {
        criteria = { phoneNumberId };
      }
    } else if (channel === 'facebook' || channel === 'messenger') {
      const entry = payload.entry?.[0];
      const pageId = entry?.id;
      if (pageId) {
        criteria = { accountId: pageId };
      }
    } else if (channel === 'instagram') {
      const entry = payload.entry?.[0];
      const igAccountId = entry?.id;
      if (igAccountId) {
        criteria = { accountId: igAccountId };
      }
    }

    if (criteria.accountId || criteria.phoneNumberId) {
      const resolvedSchema = await this.findTenantSchemaByChannelConfig(channel, criteria);
      if (resolvedSchema) {
        tenantSchema = resolvedSchema;
        this.logger.log(`[Webhook ${channel.toUpperCase()}] Tenant schema detectado para el webhook: ${tenantSchema}`);
      } else {
        this.logger.warn(`[Webhook ${channel.toUpperCase()}] No se encontró una configuración de canal activa para criteria: ${JSON.stringify(criteria)}. Se usará el esquema public.`);
      }
    }

    return TenantContextService.run({ tenantSchema }, async () => {
      try {
        if (channel === 'whatsapp') {
          const entry = payload.entry?.[0];
          const change = entry?.changes?.[0];
          const value = change?.value;
          const message = value?.messages?.[0];

          if (message && message.type === 'text') {
            const externalId = message.from;
            const text = message.text.body;
            const clientNickname = value.contacts?.[0]?.profile?.name || 'Cliente WhatsApp';
            const phoneNumberId = value.metadata?.phone_number_id;

            const channelConfig = await this.channelConfigRepository.findOne({
              where: { channel: 'whatsapp', phoneNumberId, isActive: true },
            });

            await this.receiveIncomingMessage(
              'whatsapp',
              externalId,
              clientNickname,
              text,
              channelConfig?.id,
            );
          }
        } else if (channel === 'facebook' || channel === 'messenger') {
          const entry = payload.entry?.[0];
          const messaging = entry?.messaging?.[0];
          const pageId = entry?.id;

          if (messaging && messaging.message && messaging.message.text) {
            if (messaging.message.is_echo) {
              this.logger.log(`[Webhook ${channel.toUpperCase()}] Ignorando mensaje echo (is_echo: true)`);
              return { status: 'SUCCESS' };
            }
            const senderId = messaging.sender.id;
            const text = messaging.message.text;

            const channelConfig = await this.channelConfigRepository.findOne({
              where: { channel: 'facebook', accountId: pageId, isActive: true },
            });

            let clientNickname = 'Usuario de Facebook';
            if (channelConfig && channelConfig.accessToken) {
              try {
                const res = await fetch(
                  `https://graph.facebook.com/v19.0/${senderId}?fields=first_name,last_name&access_token=${channelConfig.accessToken}`
                );
                if (res.ok) {
                  const data: any = await res.json();
                  if (data && data.first_name) {
                    clientNickname = `${data.first_name} ${data.last_name || ''}`.trim();
                  }
                }
              } catch (err) {
                this.logger.error(`Error obteniendo perfil de FB: ${err.message}`);
              }
            }

            await this.receiveIncomingMessage(
              'messenger',
              senderId,
              clientNickname,
              text,
              channelConfig?.id,
            );
          }
        } else if (channel === 'instagram') {
          const entry = payload.entry?.[0];
          const messaging = entry?.messaging?.[0];
          const igAccountId = entry?.id;

          if (messaging && messaging.message && messaging.message.text) {
            if (messaging.message.is_echo) {
              this.logger.log(`[Webhook ${channel.toUpperCase()}] Ignorando mensaje echo (is_echo: true)`);
              return { status: 'SUCCESS' };
            }
            const senderId = messaging.sender.id;
            const text = messaging.message.text;

            const channelConfig = await this.channelConfigRepository.findOne({
              where: { channel: 'instagram', accountId: igAccountId, isActive: true },
            });

            let clientNickname = 'Usuario de Instagram';
            if (channelConfig && channelConfig.accessToken) {
              try {
                const res = await fetch(
                  `https://graph.facebook.com/v19.0/${senderId}?fields=username&access_token=${channelConfig.accessToken}`
                );
                if (res.ok) {
                  const data: any = await res.json();
                  if (data && data.username) {
                    clientNickname = data.username;
                  }
                }
              } catch (err) {
                this.logger.error(`Error obteniendo perfil de IG: ${err.message}`);
              }
            }

            await this.receiveIncomingMessage(
              'instagram',
              senderId,
              clientNickname,
              text,
              channelConfig?.id,
            );
          }
        }

        return { status: 'SUCCESS' };
      } catch (error) {
        this.logger.error(`Error procesando webhook de ${channel}: ${error.message}`);
        throw error;
      }
    });
  }

  // ── ENVÍO DE MENSAJES HACIA EL EXTERIOR ────────────────────────────────────

  private async sendOutboundMessage(conversation: Conversation, content: string): Promise<void> {
    let channelConfig = conversation.channelConfig;
    if (!channelConfig && conversation.channelConfigId) {
      channelConfig = await this.channelConfigRepository.findOne({ where: { id: conversation.channelConfigId } });
    }
    if (!channelConfig) {
      channelConfig = await this.channelConfigRepository.findOne({
        where: { channel: conversation.channel, isActive: true }
      });
    }

    if (!channelConfig || !channelConfig.accessToken) {
      this.logger.log(`[SIMULADO / MOCK OUTBOUND] Canal: ${conversation.channel} | Para: ${conversation.externalId} | Mensaje: "${content}"`);
      return;
    }

    const { channel, externalId } = conversation;
    const token = channelConfig.accessToken;

    try {
      if (channel === 'whatsapp') {
        const phoneId = channelConfig.phoneNumberId;
        if (!phoneId) {
          this.logger.warn(`WhatsApp configurado pero no tiene phoneNumberId. Mensaje simulado.`);
          return;
        }

        const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
        const body = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: externalId,
          type: 'text',
          text: { body: content }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Meta API error: ${JSON.stringify(errData)}`);
        }

        this.logger.log(`[REAL WHATSAPP OUTBOUND] Mensaje enviado con éxito a ${externalId}`);
      } else if (channel === 'messenger' || channel === 'facebook') {
        const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`;
        const body = {
          recipient: { id: externalId },
          message: { text: content }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Meta API error: ${JSON.stringify(errData)}`);
        }

        this.logger.log(`[REAL MESSENGER OUTBOUND] Mensaje enviado con éxito a ${externalId}`);
      } else if (channel === 'instagram') {
        const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`;
        const body = {
          recipient: { id: externalId },
          message: { text: content }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Meta API error: ${JSON.stringify(errData)}`);
        }

        this.logger.log(`[REAL INSTAGRAM OUTBOUND] Mensaje enviado con éxito a ${externalId}`);
      }
    } catch (err) {
      this.logger.error(`Error enviando mensaje real por ${channel} a ${externalId}: ${err.message}`);
    }
  }

  /**
   * Listener de evento para envío de documentos al canal externo.
   * Permite que QuotationPdfService dispare el envío sin inyectar ConversationsService directamente.
   */
  @OnEvent(CONVERSATION_EVENTS.SEND_DOCUMENT_TO_CHANNEL)
  async handleSendDocumentToChannel(payload: {
    conversation: Conversation;
    filePath: string;
    fileName: string;
    caption?: string;
  }): Promise<void> {
    try {
      await this.sendDocumentToExternalChannel(
        payload.conversation,
        payload.filePath,
        payload.fileName,
        payload.caption,
      );
    } catch (err) {
      this.logger.error(`Error procesando evento ${CONVERSATION_EVENTS.SEND_DOCUMENT_TO_CHANNEL}: ${(err as Error).message}`);
    }
  }

  /**
   * Envía un documento/PDF por el canal de origen de la conversación (WhatsApp, Messenger, Instagram, Webchat)
   * e inserta el registro en el historial de mensajes de la conversación notificando en tiempo real vía WebSockets.
   */
  async sendDocumentToExternalChannel(
    conversation: Conversation,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<void> {
    const baseUrl = (process.env.API_URL || process.env.PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '');
    const cleanDocPath = documentUrl.replace(/\\/g, '/').replace(/^\//, '');
    const fullDocumentUrl = cleanDocPath.startsWith('http://') || cleanDocPath.startsWith('https://') 
      ? cleanDocPath 
      : `${baseUrl}/${cleanDocPath}`;

    let docMsgContent = caption
      ? `${caption}\n📄 [Cotización en PDF - ${filename}](${fullDocumentUrl})`
      : `📄 [Cotización en PDF - ${filename}](${fullDocumentUrl})`;

    try {
      const docMessage = this.messageRepository.create({
        conversationId: conversation.id,
        sender: 'agent',
        content: docMsgContent,
      });
      const savedDoc = await this.messageRepository.save(docMessage);
      const fullDocMessage = await this.messageRepository.findOne({
        where: { id: savedDoc.id },
        relations: ['senderUser'],
      });

      if (fullDocMessage) {
        this.gateway.emitMessage(fullDocMessage);
      }
    } catch (dbErr) {
      this.logger.error(`Error guardando o emitiendo mensaje de documento en conversación: ${dbErr.message}`);
    }

    const channelConfig = await this.channelConfigRepository.findOne({
      where: { channel: conversation.channel, isActive: true }
    });

    const { channel, externalId } = conversation;
    if (!channelConfig || !channelConfig.accessToken) {
      this.logger.log(`[SIMULADO / MOCK DOCUMENT OUTBOUND] Canal: ${conversation.channel} | Para: ${externalId} | Documento: "${documentUrl}"`);
      return;
    }

    const token = channelConfig.accessToken;

    try {
      if (channel === 'whatsapp') {
        const phoneId = channelConfig.phoneNumberId;
        if (!phoneId) {
          this.logger.warn(`WhatsApp configurado sin phoneNumberId para enviar documento.`);
          return;
        }

        const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
        const body = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: externalId,
          type: 'document',
          document: {
            link: fullDocumentUrl,
            filename: filename,
            caption: caption || `Cotización: ${filename}`,
          }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Meta API WhatsApp Document error: ${JSON.stringify(errData)}`);
        }

        this.logger.log(`[REAL WHATSAPP DOCUMENT OUTBOUND] Documento enviado con éxito a ${externalId}`);
      } else if (channel === 'messenger' || channel === 'facebook' || channel === 'instagram') {
        const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`;
        const body = {
          recipient: { id: externalId },
          message: {
            attachment: {
              type: 'file',
              payload: {
                url: fullDocumentUrl,
                is_reusable: true
              }
            }
          }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Meta API ${channel} Document error: ${JSON.stringify(errData)}`);
        }

        this.logger.log(`[REAL ${channel.toUpperCase()} DOCUMENT OUTBOUND] Documento enviado con éxito a ${externalId}`);
      }
    } catch (error) {
      this.logger.error(`Error enviando documento por canal ${channel}: ${error.message}`);
    }
  }
}
