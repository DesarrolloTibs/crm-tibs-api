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
import { Notification } from './entities/notification.entity';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('NotificationsGateway');

  afterInit(server: Server) {
    this.logger.log('Notifications Websocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      client.join(`user_${userId}`);
      this.logger.log(`Client ${client.id} connected and joined room user_${userId}`);
    } else {
      this.logger.log(`Client ${client.id} connected without userId query param`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from Notifications WebSocket: ${client.id}`);
  }

  @SubscribeMessage('register')
  handleRegister(@MessageBody() data: { userId: string }, @ConnectedSocket() client: Socket) {
    if (data && data.userId) {
      client.join(`user_${data.userId}`);
      this.logger.log(`Client ${client.id} explicitly registered for user_${data.userId}`);
      return { status: 'ok', room: `user_${data.userId}` };
    }
  }

  emitNotificationToUser(userId: string, notification: Notification) {
    if (this.server) {
      this.server.to(`user_${userId}`).emit('notification_received', notification);
      this.logger.log(`Emitted notification_received to user_${userId}`);
    }
  }
}
