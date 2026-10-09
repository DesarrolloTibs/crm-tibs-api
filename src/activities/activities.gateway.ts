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
  namespace: 'activities',
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ActivitiesGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('ActivitiesGateway');

  afterInit(_server: Server) {
    this.logger.log('Activities WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.substring(7)
        : undefined) ||
      (client.handshake.query?.token as string);

    if (!token) {
      this.logger.warn(`Client ${client.id} rechazado en Activities WS: Token JWT ausente`);
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

      this.logger.log(`Client ${client.id} conectado a Activities WS (tenant: ${tenantSchema}, user: ${userId})`);
    } catch (err: any) {
      this.logger.warn(`Client ${client.id} rechazado en Activities WS: JWT inválido (${err.message})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from Activities WebSocket: ${client.id}`);
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

  emitActivityCreated(activity: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('activityCreated', activity);
    } else {
      this.server.emit('activityCreated', activity);
    }
  }

  emitActivityUpdated(activity: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('activityUpdated', activity);
    } else {
      this.server.emit('activityUpdated', activity);
    }
  }

  emitActivityDeleted(activityId: string, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('activityDeleted', activityId);
    } else {
      this.server.emit('activityDeleted', activityId);
    }
  }

  emitActivityTypeCreated(type: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('activityTypeCreated', type);
    } else {
      this.server.emit('activityTypeCreated', type);
    }
  }

  emitActivityTypeUpdated(type: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('activityTypeUpdated', type);
    } else {
      this.server.emit('activityTypeUpdated', type);
    }
  }

  emitActivityTypeDeleted(typeId: number, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('activityTypeDeleted', typeId);
    } else {
      this.server.emit('activityTypeDeleted', typeId);
    }
  }
}
