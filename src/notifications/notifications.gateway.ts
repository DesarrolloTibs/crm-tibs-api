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
        : undefined) ||
      (client.handshake.query?.token as string);

    if (!token) {
      this.logger.warn(`Client ${client.id} rechazado en Notifications WS: Token JWT ausente`);
      client.disconnect(true);
      return;
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET no configurado');

      const decoded: any = jwt.verify(token, secret);
      const tenantSchema = decoded.tenantSchema || decoded.tenant || 'public';
      const userId = decoded.sub || decoded.userId || decoded.id;

      if (!userId) {
        throw new Error('ID de usuario no presente en payload JWT');
      }

      (client as any).tenantSchema = tenantSchema;
      (client as any).userId = userId;

      client.join(`tenant:${tenantSchema}`);
      client.join(`user_${userId}`);
      client.join(`user:${userId}`);

      this.logger.log(`Client ${client.id} conectado a Notifications WS (tenant: ${tenantSchema}, user: ${userId})`);
    } catch (err: any) {
      this.logger.warn(`Client ${client.id} rechazado en Notifications WS: JWT inválido (${err.message})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from Notifications WebSocket: ${client.id}`);
  }

  @SubscribeMessage('register')
  handleRegister(@MessageBody() data: { userId: string }, @ConnectedSocket() client: Socket) {
    const authenticatedUserId = (client as any).userId;
    const targetUserId = authenticatedUserId || data?.userId;
    if (targetUserId) {
      client.join(`user_${targetUserId}`);
      client.join(`user:${targetUserId}`);
      this.logger.log(`Client ${client.id} registered for user_${targetUserId}`);
      return { status: 'ok', room: `user_${targetUserId}` };
    }
  }

  emitNotificationToUser(userId: string, notification: Notification) {
    if (this.server) {
      this.server.to(`user_${userId}`).to(`user:${userId}`).emit('notification_received', notification);
      this.logger.log(`Emitted notification_received to user_${userId}`);
    }
  }
}
