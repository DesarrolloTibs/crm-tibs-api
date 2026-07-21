import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';
import { ChannelConfig } from './entities/channel-config.entity';
import { ConversationsGateway } from './conversations.gateway';
import { AiAgentService } from './ai-agent.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger('ConversationsService');

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
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
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

    // Adjuntar el último mensaje a cada conversación
    const results = await Promise.all(
      conversations.map(async (conv) => {
        const lastMessage = await this.messageRepository.findOne({
          where: { conversationId: conv.id },
          order: { createdAt: 'DESC' },
        });
        return {
          ...conv,
          lastMessage,
        };
      })
    );

    return results;
  }

  /**
   * Obtiene los mensajes de una conversación específica.
   */
  async findMessages(conversationId: string): Promise<Message[]> {
    return this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      relations: ['senderUser'],
    });
  }

  /**
   * Obtiene una conversación por canal e ID externo (por ejemplo, visitorId de webchat).
   */
  async findByChannelAndExternalId(channel: string, externalId: string): Promise<Conversation | null> {
    return this.conversationRepository.findOne({ where: { channel, externalId } });
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
      
      // Intentar resolver cliente existente por teléfono en WhatsApp
      let linkedClientId: string | null = null;
      if (channel === 'whatsapp') {
        const existingClient = await this.clientRepository.findOne({
          where: { telefono: externalId },
        });
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

    // 3. Si el bot está activo, disparar proceso de IA
    if (conversation.botActive) {
      const aiPromise = this.triggerAiReply(conversation, text);
      if (channel === 'webchat') {
        await aiPromise;
      }
    }

    return savedIncoming;
  }

  /**
   * Ejecuta el razonamiento del Agente IA en segundo plano y responde.
   */
  private async triggerAiReply(conversation: Conversation, text: string) {
    try {
      const { reply, route, isHandedOff } = await this.aiAgentService.processIncomingMessage(conversation, text);
      
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
          await this.notificationsService.createAndSendNotification(
            conversation.assignedUserId,
            notificationTitle,
            notificationMessage,
            'conversation_escalated',
            conversation.id,
            true,
          );
        } else {
          // Notificar a administradores si no hay un ejecutivo asignado
          const adminUsers = await this.userRepository.find({ where: { role: Role.Admin, isActive: true } });
          for (const admin of adminUsers) {
            await this.notificationsService.createAndSendNotification(
              admin.id,
              notificationTitle,
              notificationMessage,
              'conversation_escalated',
              conversation.id,
              false,
            );
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

    // Guardar el mensaje manual
    const manualMessage = this.messageRepository.create({
      conversationId,
      sender: 'user', // Identifica intervención humana del ejecutivo
      senderUserId,
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

    // Obtener detalles del usuario que lo cambió
    const user = await this.userRepository.findOne({ where: { id: triggerUserId } });
    const userName = user ? `${user.username}` : 'Sistema';

    // Registrar mensaje de auditoría de sistema
    const auditMessage = this.messageRepository.create({
      conversationId,
      sender: 'system',
      senderUserId: triggerUserId,
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
  async assignUser(conversationId: string, assignedUserId: string, triggerUserId: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({ where: { id: conversationId } });
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada.');
    }

    const previousUser = conversation.assignedUserId 
      ? await this.userRepository.findOne({ where: { id: conversation.assignedUserId } })
      : null;
    
    const newUser = await this.userRepository.findOne({ where: { id: assignedUserId } });
    if (!newUser) {
      throw new NotFoundException('El usuario asignado no existe.');
    }

    conversation.assignedUserId = assignedUserId;
    conversation.assignedUser = newUser;
    const updated = await this.conversationRepository.save(conversation);

    const triggerUser = await this.userRepository.findOne({ where: { id: triggerUserId } });
    const triggerUserName = triggerUser ? triggerUser.username : 'Sistema';

    // Registrar mensaje de auditoría de sistema
    const auditContent = previousUser
      ? `Conversación reasignada de ${previousUser.username} a ${newUser.username} por ${triggerUserName}.`
      : `Conversación asignada a ${newUser.username} por ${triggerUserName}.`;

    const auditMessage = this.messageRepository.create({
      conversationId,
      sender: 'system',
      senderUserId: triggerUserId,
      content: auditContent,
    });
    const savedAudit = await this.messageRepository.save(auditMessage);
    const fullAudit = await this.messageRepository.findOne({
      where: { id: savedAudit.id },
      relations: ['senderUser'],
    });

    // Notificar en tiempo real
    this.gateway.emitConversationAssigned(conversationId, assignedUserId);
    this.gateway.emitMessage(fullAudit!);

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

  async verifyMetaWebhook(channel: string, mode: string, token: string, challenge: string): Promise<string> {
    this.logger.log(`[Webhook ${channel.toUpperCase()}] Petición de verificación recibida. mode=${mode}, token=${token}, challenge=${challenge}`);
    
    if (mode === 'subscribe' && token) {
      const allConfigs = await this.channelConfigRepository.find({ where: { channel } });
      this.logger.log(`[Webhook ${channel.toUpperCase()}] Configuraciones en DB para este canal: ${JSON.stringify(allConfigs)}`);

      const config = await this.channelConfigRepository.findOne({
        where: { channel, verifyToken: token, isActive: true },
      });
      if (config) {
        this.logger.log(`[Webhook ${channel.toUpperCase()}] Webhook verificado correctamente`);
        return challenge;
      }
    }
    this.logger.warn(`[Webhook ${channel.toUpperCase()}] Falló intento de verificación de webhook`);
    throw new NotFoundException('Token de verificación inválido o canal inactivo');
  }

  async handleIncomingWebhook(channel: string, payload: any): Promise<any> {
    this.logger.log(`[Webhook ${channel.toUpperCase()}] Recibido body: ${JSON.stringify(payload)}`);

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
}
