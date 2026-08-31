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
    this.logger.debug(`Client connected to Pipelines WebSocket: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from Pipelines WebSocket: ${client.id}`);
  }

  emitOpportunityCreated(opportunity: any) {
    if (this.server) {
      this.server.emit('opportunityCreated', opportunity);
    }
  }

  emitOpportunityUpdated(opportunity: any) {
    if (this.server) {
      this.server.emit('opportunityUpdated', opportunity);
    }
  }

  emitOpportunityDeleted(opportunityId: string) {
    if (this.server) {
      this.server.emit('opportunityDeleted', opportunityId);
    }
  }

  emitPipelineUpdated(pipeline: any) {
    if (this.server) {
      this.server.emit('pipelineUpdated', pipeline);
    }
  }
}
