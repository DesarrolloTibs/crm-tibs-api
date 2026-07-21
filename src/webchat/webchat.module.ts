import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebchatController } from './webchat.controller';
import { WebchatService } from './webchat.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { Stage } from '../stages/entities/stage.entity';
import { TicketStage } from '../tickets/entities/ticket-stage.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stage, TicketStage]),
    ConversationsModule,
  ],
  controllers: [WebchatController],
  providers: [WebchatService],
  exports: [WebchatService],
})
export class WebchatModule {}
