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
    authenticateTenantSocket(client, this.logger, 'Tickets');
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from Tickets WebSocket: ${client.id}`);
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

  emitTicketCreated(ticket: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[TicketsGateway] emitTicketCreated -> ${room} (Ticket ID: ${ticket?.id || 'N/A'}, Folio: #${ticket?.ticket_number || 'N/A'})`);
      this.server.to(room).emit('ticketCreated', ticket);
    } else {
      this.logger.warn(`[TicketsGateway] emitTicketCreated emitido globalmente (sin sala específica)`);
      this.server.emit('ticketCreated', ticket);
    }
  }

  emitTicketUpdated(ticket: any, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[TicketsGateway] emitTicketUpdated -> ${room} (Ticket ID: ${ticket?.id || 'N/A'}, Folio: #${ticket?.ticket_number || 'N/A'})`);
      this.server.to(room).emit('ticketUpdated', ticket);
    } else {
      this.server.emit('ticketUpdated', ticket);
    }
  }

  emitTicketDeleted(ticketId: string, tenantSchema?: string) {
    if (!this.server) return;
    const room = this.getTargetRoom(tenantSchema);
    if (room) {
      this.logger.log(`[TicketsGateway] emitTicketDeleted -> ${room} (Ticket ID: ${ticketId})`);
      this.server.to(room).emit('ticketDeleted', ticketId);
    } else {
      this.server.emit('ticketDeleted', ticketId);
    }
  }
}
