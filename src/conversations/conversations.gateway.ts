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
import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { OnEvent } from '@nestjs/event-emitter';
import { Message } from './entities/message.entity';
import { CONVERSATION_EVENTS } from '../common/events/conversation.events';
import { TenantContextService } from '../tenancy/tenant-context.service';

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
        : undefined) ||
      (client.handshake.query?.token as string);

    if (!token) {
      this.logger.warn(`Client ${client.id} rechazado en Conversations WS: Token JWT ausente`);
      client.disconnect(true);
      return;
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET no está configurado en las variables de entorno');

      const decoded: any = jwt.verify(token, secret);
      const isSuperAdmin = decoded.role === 'superadmin';
      const tokenTenant = decoded.tenantSchema || decoded.tenant || 'public';
      const requestedTenant =
        (client.handshake.auth?.tenantSchema as string) ||
        (client.handshake.query?.tenantSchema as string) ||
        (client.handshake.headers?.['x-tenant-schema'] as string) ||
        tokenTenant;

      // Si es superadmin o el token es de public, permitir escuchar el tenant solicitado
      const tenantSchema = (isSuperAdmin || tokenTenant === 'public') ? requestedTenant : tokenTenant;
      const userId = decoded.sub || decoded.userId || decoded.id;

      (client as any).tenantSchema = tenantSchema;
      (client as any).userId = userId;

      client.join(`tenant:${tenantSchema}`);
      if (tokenTenant !== tenantSchema) {
        client.join(`tenant:${tokenTenant}`);
      }
      if (userId) client.join(`user:${userId}`);

      this.logger.log(`Client ${client.id} conectado a Conversations WS (tenant: ${tenantSchema}, user: ${userId})`);
    } catch (err: any) {
      this.logger.warn(`Client ${client.id} rechazado en Conversations WS: JWT inválido (${err.message})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from Conversations WebSocket: ${client.id}`);
  }

  @SubscribeMessage('set_tenant')
  handleSetTenant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tenantSchema: string },
  ) {
    if (data?.tenantSchema) {
      const current = (client as any).tenantSchema;
      if (current && current !== data.tenantSchema) {
        client.leave(`tenant:${current}`);
      }
      (client as any).tenantSchema = data.tenantSchema;
      client.join(`tenant:${data.tenantSchema}`);
      this.logger.log(`Client ${client.id} cambió de tenant a tenant:${data.tenantSchema}`);
      return { status: 'ok', room: `tenant:${data.tenantSchema}` };
    }
  }

  @SubscribeMessage('join_tenant')
  handleJoinTenant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tenantSchema: string },
  ) {
    if (data?.tenantSchema) {
      client.join(`tenant:${data.tenantSchema}`);
      this.logger.log(`Client ${client.id} joined room tenant:${data.tenantSchema}`);
      return { status: 'ok', room: `tenant:${data.tenantSchema}` };
    }
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
