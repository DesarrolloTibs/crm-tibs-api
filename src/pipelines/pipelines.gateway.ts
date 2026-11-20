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
    authenticateTenantSocket(client, this.logger, 'Pipelines');
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from Pipelines WebSocket: ${client.id}`);
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

  emitOpportunityCreated(opportunity: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[PipelinesGateway] emitOpportunityCreated -> ${room} (Opp ID: ${opportunity?.id || 'N/A'}, Proyecto: "${opportunity?.nombre_proyecto || 'N/A'}")`);
      this.server.to(room).emit('opportunityCreated', opportunity);
    } else {
      this.logger.warn(`[PipelinesGateway] emitOpportunityCreated emitido globalmente (sin sala específica)`);
      this.server.emit('opportunityCreated', opportunity);
    }
  }

  emitOpportunityUpdated(opportunity: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[PipelinesGateway] emitOpportunityUpdated -> ${room} (Opp ID: ${opportunity?.id || 'N/A'}, Proyecto: "${opportunity?.nombre_proyecto || 'N/A'}")`);
      this.server.to(room).emit('opportunityUpdated', opportunity);
    } else {
      this.server.emit('opportunityUpdated', opportunity);
    }
  }

  emitOpportunityDeleted(opportunityId: string, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[PipelinesGateway] emitOpportunityDeleted -> ${room} (Opp ID: ${opportunityId})`);
      this.server.to(room).emit('opportunityDeleted', opportunityId);
    } else {
      this.server.emit('opportunityDeleted', opportunityId);
    }
  }

  emitPipelineUpdated(pipeline: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[PipelinesGateway] emitPipelineUpdated -> ${room} (Pipeline ID: ${pipeline?.id || 'N/A'})`);
      this.server.to(room).emit('pipelineUpdated', pipeline);
    } else {
      this.server.emit('pipelineUpdated', pipeline);
    }
  }
}
