import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { ChannelConfig } from './entities/channel-config.entity';
import { AiSubAgent } from './entities/ai-sub-agent.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { ProductFile } from '../products/entities/product-file.entity';
import { ConversationsService } from './conversations.service';
import { AiAgentService } from './ai-agent.service';
import { ConversationsGateway } from './conversations.gateway';
import { ConversationsController } from './conversations.controller';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ActivitiesModule } from '../Activities/activities.module';
import { RemindersModule } from '../reminders/reminders.module';
import { ClientsModule } from '../clients/clients.module';
import { TicketsModule } from '../tickets/tickets.module';
import { RagModule } from '../rag/rag.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation, 
      Message, 
      AiAgentConfig, 
      ChannelConfig, 
      AiSubAgent, 
      Client, 
      User,
      Product,
      ProductFile
    ]),
    forwardRef(() => OpportunitiesModule),
    ActivitiesModule,
    RemindersModule,
    ClientsModule,
    TicketsModule,
    RagModule,
    SubscriptionsModule,
    forwardRef(() => NotificationsModule),
  ],

  providers: [ConversationsService, AiAgentService, ConversationsGateway],
  controllers: [ConversationsController],
  exports: [ConversationsService, AiAgentService, ConversationsGateway],
})
export class ConversationsModule {}
