import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { TenantContextService } from '../tenancy/tenant-context.service';

@WebSocketGateway({
  namespace: 'pipelines',
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class PipelinesGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('PipelinesGateway');

  afterInit(_server: Server) {
    this.logger.log('Pipelines WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.substring(7)
        : undefined) ||
      (client.handshake.query?.token as string);

    if (!token) {
      this.logger.warn(`Client ${client.id} rechazado en Pipelines WS: Token JWT ausente`);
      client.disconnect(true);
      return;
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET no configurado');

      const decoded: any = jwt.verify(token, secret);
      const tenantSchema = decoded.tenantSchema || decoded.tenant || 'public';
      const userId = decoded.sub || decoded.userId || decoded.id;

      (client as any).tenantSchema = tenantSchema;
      (client as any).userId = userId;

      client.join(`tenant:${tenantSchema}`);
      if (userId) client.join(`user:${userId}`);

      this.logger.log(`Client ${client.id} conectado a Pipelines WS (tenant: ${tenantSchema}, user: ${userId})`);
    } catch (err: any) {
      this.logger.warn(`Client ${client.id} rechazado en Pipelines WS: JWT inválido (${err.message})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from Pipelines WebSocket: ${client.id}`);
  }

  private getTargetRoom(tenantSchema?: string): string | null {
    const target = tenantSchema || TenantContextService.getTenantSchema();
    return target ? `tenant:${target}` : null;
  }

  emitOpportunityCreated(opportunity: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('opportunityCreated', opportunity);
    } else {
      this.server.emit('opportunityCreated', opportunity);
    }
  }

  emitOpportunityUpdated(opportunity: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('opportunityUpdated', opportunity);
    } else {
      this.server.emit('opportunityUpdated', opportunity);
    }
  }

  emitOpportunityDeleted(opportunityId: string, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('opportunityDeleted', opportunityId);
    } else {
      this.server.emit('opportunityDeleted', opportunityId);
    }
  }

  emitPipelineUpdated(pipeline: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.server.to(room).emit('pipelineUpdated', pipeline);
    } else {
      this.server.emit('pipelineUpdated', pipeline);
    }
  }
}
