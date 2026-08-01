import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Message } from './entities/message.entity';
import { CONVERSATION_EVENTS } from '../common/events/conversation.events';

@WebSocketGateway({
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  cors: {
    origin: (origin, callback) => {
      const raw = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'https://billyss.tibsapps.com.mx';
      const allowed = raw.split(',').map((o) => {
        try { return new URL(o.trim()).origin; } catch { return o.trim().replace(/\/+$|\/.*$/g, ''); }
      });

      if (!origin || allowed.includes(origin) || origin.includes('tibsapps.com.mx') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
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
    this.logger.log(`Client connected to Conversations WebSocket: ${client.id}`);
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

  /**
   * Listener de evento para consumo de tokens de tenant.
   * Permite que AiAgentService notifique al Gateway sin inyectarlo directamente.
   */
  @OnEvent(CONVERSATION_EVENTS.TENANT_CONSUMPTION_UPDATED)
  handleTenantConsumptionUpdated(payload: { schemaName: string }): void {
    this.emitTenantConsumptionUpdated(payload.schemaName);
  }
}
