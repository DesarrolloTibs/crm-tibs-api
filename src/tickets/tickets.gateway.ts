import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

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
    this.logger.debug(`Client connected to Tickets WebSocket: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from Tickets WebSocket: ${client.id}`);
  }

  emitTicketCreated(ticket: any) {
    if (this.server) {
      this.server.emit('ticketCreated', ticket);
    }
  }

  emitTicketUpdated(ticket: any) {
    if (this.server) {
      this.server.emit('ticketUpdated', ticket);
    }
  }

  emitTicketDeleted(ticketId: string) {
    if (this.server) {
      this.server.emit('ticketDeleted', ticketId);
    }
  }
}
