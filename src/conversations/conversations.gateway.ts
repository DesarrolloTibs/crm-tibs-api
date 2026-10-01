import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { OnEvent } from '@nestjs/event-emitter';
import { Message } from './entities/message.entity';
import { CONVERSATION_EVENTS } from '../common/events/conversation.events';

@WebSocketGateway({
  namespace: 'conversations',
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ConversationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('ConversationsGateway');

  afterInit(server: Server) {
    this.logger.log('Conversations WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.substring(7)
        : undefined);

    let info = '';
    if (token) {
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET no está configurado en las variables de entorno');
        }
        const decoded: any = jwt.verify(token, secret);
        info = ` (user: ${decoded.username || decoded.sub}, role: ${decoded.role})`;
      } catch (err: any) {
        this.logger.warn(`Client ${client.id} WS handshake con token JWT inválido: ${err.message}`);
      }
    }
    this.logger.log(`Client connected to Conversations WebSocket: ${client.id}${info}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from Conversations WebSocket: ${client.id}`);
  }

  emitMessage(message: Message) {
    if (this.server) {
      this.server.emit('message_received', message);
      this.logger.log(`Emitted message_received for conversation ${message.conversationId}`);
    }
  }

  emitBotStatusChanged(conversationId: string, botActive: boolean) {
    if (this.server) {
      this.server.emit('bot_status_changed', { conversationId, botActive });
      this.logger.log(`Emitted bot_status_changed for conversation ${conversationId}`);
    }
  }

  emitConversationAssigned(conversationId: string, assignedUserId: string | null) {
    if (this.server) {
      this.server.emit('conversation_assigned', { conversationId, assignedUserId });
      this.logger.log(`Emitted conversation_assigned for conversation ${conversationId}`);
    }
  }

  emitTenantConsumptionUpdated(schemaName: string) {
    if (this.server) {
      this.server.emit('tenant_consumption_updated', { schemaName });
      this.logger.log(`Emitted tenant_consumption_updated for schema ${schemaName}`);
    }
  }

  emitMessageStatusUpdated(payload: {
    messageId: string;
    conversationId: string;
    status: string;
    externalMessageId?: string | null;
    errorMessage?: string | null;
  }) {
    if (this.server) {
      this.server.emit('message_status_updated', payload);
      this.logger.log(`Emitted message_status_updated for message ${payload.messageId} (${payload.status})`);
    }
  }

  /**
   * Listener de evento para consumo de tokens de tenant.
   * Permite que AiAgentService notifique al Gateway sin inyectarlo directamente.
   */
  @OnEvent(CONVERSATION_EVENTS.TENANT_CONSUMPTION_UPDATED)
  handleTenantConsumptionUpdated(payload: { schemaName: string }): void {
    this.emitTenantConsumptionUpdated(payload.schemaName);
  }
}
