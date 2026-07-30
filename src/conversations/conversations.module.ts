import { Module } from '@nestjs/common';
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
import { AiAgentOrchestratorService } from './ai-agent-orchestrator.service';
import { AiAgentToolsHandlerService } from './ai-agent-tools-handler.service';
import { AiSubAgentMigrationService } from './ai-sub-agent-migration.service';
import { ConversationsGateway } from './conversations.gateway';
import { ConversationsController } from './conversations.controller';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ActivitiesModule } from '../activities/activities.module';
import { RemindersModule } from '../reminders/reminders.module';
import { ClientsModule } from '../clients/clients.module';
import { TicketsModule } from '../tickets/tickets.module';
import { RagModule } from '../rag/rag.module';
import { UsersModule } from '../users/users.module';
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
      ProductFile,
    ]),
    // OpportunitiesModule: needed by AiAgentToolsHandlerService
    // No longer circular — QuotationPdfService uses EventEmitter instead of direct injection
    OpportunitiesModule,
    ActivitiesModule,
    RemindersModule,
    ClientsModule,
    TicketsModule,
    RagModule,
    SubscriptionsModule,
    UsersModule,
    // NotificationsModule is NOT imported — ConversationsService uses EventEmitter for notifications
  ],
  providers: [
    ConversationsService,
    ConversationsGateway,
    // AI Agent subsystem — 3 specialized services + 1 facade
    AiSubAgentMigrationService,
    AiAgentToolsHandlerService,
    AiAgentOrchestratorService,
    AiAgentService,
  ],
  controllers: [ConversationsController],
  exports: [ConversationsService, AiAgentService, ConversationsGateway],
})
export class ConversationsModule {}
