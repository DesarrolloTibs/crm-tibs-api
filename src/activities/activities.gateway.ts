import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

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
    this.logger.debug(`Client connected to Activities WebSocket: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from Activities WebSocket: ${client.id}`);
  }

  emitActivityCreated(activity: any) {
    if (this.server) {
      this.server.emit('activityCreated', activity);
    }
  }

  emitActivityUpdated(activity: any) {
    if (this.server) {
      this.server.emit('activityUpdated', activity);
    }
  }

  emitActivityDeleted(activityId: string) {
    if (this.server) {
      this.server.emit('activityDeleted', activityId);
    }
  }

  emitActivityTypeCreated(type: any) {
    if (this.server) {
      this.server.emit('activityTypeCreated', type);
    }
  }

  emitActivityTypeUpdated(type: any) {
    if (this.server) {
      this.server.emit('activityTypeUpdated', type);
    }
  }

  emitActivityTypeDeleted(typeId: number) {
    if (this.server) {
      this.server.emit('activityTypeDeleted', typeId);
    }
  }
}
