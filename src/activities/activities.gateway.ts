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
import { Logger, UsePipes } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  authenticateTenantSocket,
  createWsValidationPipe,
  handleAuthorizedTenantRoom,
  WsTenantPayloadDto,
} from '../common/utils/ws-tenant.util';

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
    authenticateTenantSocket(client, this.logger, 'Activities');
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from Activities WebSocket: ${client.id}`);
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
    const target = tenantSchema && tenantSchema !== 'public'
      ? tenantSchema
      : TenantContextService.getTenantSchema();
    return target && target !== 'public' ? `tenant:${target}` : (target ? `tenant:${target}` : null);
  }

  emitActivityCreated(activity: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[ActivitiesGateway] emitActivityCreated -> ${room} (Act ID: ${activity?.id || 'N/A'}, Detalle: "${activity?.activity?.substring(0, 40) || 'N/A'}")`);
      this.server.to(room).emit('activityCreated', activity);
    } else {
      this.logger.warn(`[ActivitiesGateway] emitActivityCreated emitido globalmente (sin sala específica)`);
      this.server.emit('activityCreated', activity);
    }
  }

  emitActivityUpdated(activity: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[ActivitiesGateway] emitActivityUpdated -> ${room} (Act ID: ${activity?.id || 'N/A'})`);
      this.server.to(room).emit('activityUpdated', activity);
    } else {
      this.server.emit('activityUpdated', activity);
    }
  }

  emitActivityDeleted(activityId: string, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[ActivitiesGateway] emitActivityDeleted -> ${room} (Act ID: ${activityId})`);
      this.server.to(room).emit('activityDeleted', activityId);
    } else {
      this.server.emit('activityDeleted', activityId);
    }
  }

  emitActivityTypeCreated(type: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[ActivitiesGateway] emitActivityTypeCreated -> ${room} (Type ID: ${type?.id || 'N/A'})`);
      this.server.to(room).emit('activityTypeCreated', type);
    } else {
      this.server.emit('activityTypeCreated', type);
    }
  }

  emitActivityTypeUpdated(type: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[ActivitiesGateway] emitActivityTypeUpdated -> ${room} (Type ID: ${type?.id || 'N/A'})`);
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
