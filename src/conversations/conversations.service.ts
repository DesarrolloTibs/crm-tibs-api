import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { ConversationsGateway } from './conversations.gateway';
import { AiAgentService } from './ai-agent.service';

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
    private readonly gateway: ConversationsGateway,
    private readonly aiAgentService: AiAgentService,
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
   * Registra y procesa un mensaje entrante (simulado o webhook real de Meta).
   */
  async receiveIncomingMessage(channel: string, externalId: string, clientNickname: string, text: string): Promise<Message> {
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
      // Ejecución asíncrona para no bloquear el webhook de Meta y responder en tiempo real
      this.triggerAiReply(conversation, text);
    }

    return savedIncoming;
  }

  /**
   * Ejecuta el razonamiento del Agente IA en segundo plano y responde.
   */
  private async triggerAiReply(conversation: Conversation, text: string) {
    try {
      const aiReply = await this.aiAgentService.processIncomingMessage(conversation, text);
      if (aiReply && aiReply.trim() !== '') {
        const botMessage = this.messageRepository.create({
          conversationId: conversation.id,
          sender: 'agent',
          content: aiReply,
        });
        const savedBot = await this.messageRepository.save(botMessage);
        
        // Simular envío de mensaje al canal externo
        this.logger.log(`[MOCK META OUTBOUND] Canal: ${conversation.channel} | Para: ${conversation.externalId} | Mensaje: "${aiReply}"`);

        this.gateway.emitMessage(savedBot);

        // Actualizar timestamp
        conversation.updatedAt = new Date();
        await this.conversationRepository.save(conversation);
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

    // Simular envío de mensaje al canal externo
    this.logger.log(`[MOCK META OUTBOUND INTERVENCIÓN] Canal: ${conversation.channel} | Para: ${conversation.externalId} | Mensaje: "${content}"`);

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
}
