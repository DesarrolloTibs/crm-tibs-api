import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

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
