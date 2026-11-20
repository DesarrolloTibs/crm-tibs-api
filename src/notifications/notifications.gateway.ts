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
import { Logger, UsePipes } from '@nestjs/common';
import { Notification } from './entities/notification.entity';
import {
  authenticateTenantSocket,
  createWsValidationPipe,
  WsRegisterUserDto,
} from '../common/utils/ws-tenant.util';

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
    authenticateTenantSocket(client, this.logger, 'Notifications', { requireUserId: true });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from Notifications WebSocket: ${client.id}`);
  }

  @UsePipes(createWsValidationPipe())
  @SubscribeMessage('register')
  handleRegister(@MessageBody() data: WsRegisterUserDto, @ConnectedSocket() client: Socket) {
    const authenticatedUserId = (client as any).userId;
    if (!authenticatedUserId) {
      return { status: 'unauthorized' };
    }
    if (data?.userId && data.userId !== authenticatedUserId) {
      this.logger.warn(`Client ${client.id} (${authenticatedUserId}) intentó registrarse en notificaciones de ${data.userId}`);
      return { status: 'forbidden' };
    }
    client.join(`user_${authenticatedUserId}`);
    client.join(`user:${authenticatedUserId}`);
    this.logger.log(`Client ${client.id} registered for user_${authenticatedUserId}`);
    return { status: 'ok', room: `user_${authenticatedUserId}` };
  }

  emitNotificationToUser(userId: string, notification: Notification) {
    if (this.server) {
      this.server.to(`user_${userId}`).to(`user:${userId}`).emit('notification_received', notification);
      this.logger.log(`Emitted notification_received to user_${userId}`);
    }
  }
}
