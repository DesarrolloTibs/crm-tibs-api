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
import * as jwt from 'jsonwebtoken';
import { Notification } from './entities/notification.entity';

@WebSocketGateway({
  namespace: 'notifications',
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('NotificationsGateway');

  afterInit(server: Server) {
    this.logger.log('Notifications Websocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.substring(7)
        : undefined);

    let authenticatedUserId: string | null = null;

    if (token) {
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET no está configurado en las variables de entorno');
        }
        const decoded: any = jwt.verify(token, secret);
        authenticatedUserId = decoded.sub || decoded.userId || null;
      } catch (err: any) {
        this.logger.warn(`Client ${client.id} WS handshake con token JWT no válido: ${err.message}`);
      }
    }

    if (authenticatedUserId) {
      (client as any).userId = authenticatedUserId;
      client.join(`user_${authenticatedUserId}`);
      this.logger.log(`Client ${client.id} connected and joined room user_${authenticatedUserId}`);
    } else {
      this.logger.warn(`Client ${client.id} conectado sin autenticación JWT válida`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from Notifications WebSocket: ${client.id}`);
  }

  @SubscribeMessage('register')
  handleRegister(@MessageBody() data: { userId: string }, @ConnectedSocket() client: Socket) {
    const authenticatedUserId = (client as any).userId;
    // Si el socket ya fue autenticado por JWT, respeta la identidad verificada
    const targetUserId = authenticatedUserId || data?.userId;
    if (targetUserId) {
      client.join(`user_${targetUserId}`);
      this.logger.log(`Client ${client.id} explicitly registered for user_${targetUserId}`);
      return { status: 'ok', room: `user_${targetUserId}` };
    }
  }

  emitNotificationToUser(userId: string, notification: Notification) {
    if (this.server) {
      this.server.to(`user_${userId}`).emit('notification_received', notification);
      this.logger.log(`Emitted notification_received to user_${userId}`);
    }
  }
}
