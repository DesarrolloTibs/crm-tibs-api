import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UsePipes } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Message } from './entities/message.entity';
import { CONVERSATION_EVENTS } from '../common/events/conversation.events';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  authenticateTenantSocket,
  createWsValidationPipe,
  handleAuthorizedTenantRoom,
  WsTenantPayloadDto,
} from '../common/utils/ws-tenant.util';

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
    authenticateTenantSocket(client, this.logger, 'Conversations');
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from Conversations WebSocket: ${client.id}`);
  }

  @UsePipes(createWsValidationPipe())
  @SubscribeMessage('set_tenant')
  handleSetTenant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WsTenantPayloadDto,
  ) {
    return handleAuthorizedTenantRoom(client, this.logger, data, 'set');
  }

  @UsePipes(createWsValidationPipe())
  @SubscribeMessage('join_tenant')
  handleJoinTenant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: WsTenantPayloadDto,
  ) {
    return handleAuthorizedTenantRoom(client, this.logger, data, 'join');
  }

  private getTargetRoom(tenantSchema?: string): string | null {
    const target = tenantSchema || TenantContextService.getTenantSchema();
    return target ? `tenant:${target}` : null;
  }

  emitMessage(message: Message, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('message_received', message);
    } else {
      this.server.emit('message_received', message);
    }
    this.logger.log(`Emitted message_received for conversation ${message.conversationId} (room: ${room})`);
  }

  emitBotStatusChanged(conversationId: string, botActive: boolean, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    const payload = { conversationId, botActive };
    if (room) {
      this.server.to(room).emit('bot_status_changed', payload);
    } else {
      this.server.emit('bot_status_changed', payload);
    }
    this.logger.log(`Emitted bot_status_changed for conversation ${conversationId} (room: ${room})`);
  }

  emitConversationAssigned(conversationId: string, assignedUserId: string | null, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    const payload = { conversationId, assignedUserId };
    if (room) {
      this.server.to(room).emit('conversation_assigned', payload);
    } else {
      this.server.emit('conversation_assigned', payload);
    }
    this.logger.log(`Emitted conversation_assigned for conversation ${conversationId} (room: ${room})`);
  }

  emitTenantConsumptionUpdated(schemaName: string) {
    if (!this.server) return;
    const room = `tenant:${schemaName}`;
    this.server.to(room).emit('tenant_consumption_updated', { schemaName });
    this.logger.log(`Emitted tenant_consumption_updated for schema ${schemaName}`);
  }

  emitMessageStatusUpdated(
    payload: {
      messageId: string;
      conversationId: string;
      status: string;
      externalMessageId?: string | null;
      errorMessage?: string | null;
    },
    tenantSchema?: string,
  ) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('message_status_updated', payload);
    } else {
      this.server.emit('message_status_updated', payload);
    }
    this.logger.log(`Emitted message_status_updated for message ${payload.messageId} (${payload.status}, room: ${room})`);
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
