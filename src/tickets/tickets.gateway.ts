import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TicketsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  afterInit(server: Server) {
    console.log('Tickets Websocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected to WebSocket: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected from WebSocket: ${client.id}`);
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
