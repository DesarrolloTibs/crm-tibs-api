import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { ChannelConfig } from './entities/channel-config.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { ConversationsService } from './conversations.service';
import { AiAgentService } from './ai-agent.service';
import { ConversationsGateway } from './conversations.gateway';
import { ConversationsController } from './conversations.controller';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ActivitiesModule } from '../Activities/activities.module';
import { RemindersModule } from '../reminders/reminders.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, AiAgentConfig, ChannelConfig, Client, User]),
    OpportunitiesModule,
    ActivitiesModule,
    RemindersModule,
    ClientsModule,
  ],
  providers: [ConversationsService, AiAgentService, ConversationsGateway],
  controllers: [ConversationsController],
  exports: [ConversationsService, AiAgentService, ConversationsGateway],
})
export class ConversationsModule {}
