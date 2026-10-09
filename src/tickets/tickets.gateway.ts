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
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { TenantContextService } from '../tenancy/tenant-context.service';

@WebSocketGateway({
  namespace: 'tickets',
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class TicketsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('TicketsGateway');

  afterInit(_server: Server) {
    this.logger.log('Tickets WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.substring(7)
        : undefined) ||
      (client.handshake.query?.token as string);

    if (!token) {
      this.logger.warn(`Client ${client.id} rechazado en Tickets WS: Token JWT ausente`);
      client.disconnect(true);
      return;
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET no configurado');

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

      this.logger.log(`Client ${client.id} conectado a Tickets WS (tenant: ${tenantSchema}, user: ${userId})`);
    } catch (err: any) {
      this.logger.warn(`Client ${client.id} rechazado en Tickets WS: JWT inválido (${err.message})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from Tickets WebSocket: ${client.id}`);
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

  emitTicketCreated(ticket: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('ticketCreated', ticket);
    } else {
      this.server.emit('ticketCreated', ticket);
    }
  }

  emitTicketUpdated(ticket: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('ticketUpdated', ticket);
    } else {
      this.server.emit('ticketUpdated', ticket);
    }
  }

  emitTicketDeleted(ticketId: string, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('ticketDeleted', ticketId);
    } else {
      this.server.emit('ticketDeleted', ticketId);
    }
  }
}
