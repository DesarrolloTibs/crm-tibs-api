import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebchatController } from './webchat.controller';
import { WebchatService } from './webchat.service';
import { WebchatPromptBuilderService } from './services/webchat-prompt-builder.service';
import { WebchatQueryPlannerService } from './services/webchat-query-planner.service';
import { WebchatSecurityService } from './services/webchat-security.service';
import { WebchatCubeExecutorService } from './services/webchat-cube-executor.service';
import { WebchatEntityMatcherService } from './services/webchat-entity-matcher.service';
import { WebchatResponseFormatterService } from './services/webchat-response-formatter.service';
import { WebchatActionExecutorService } from './services/webchat-action-executor.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ActivitiesModule } from '../activities/activities.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ClientsModule } from '../clients/clients.module';
import { CompaniesModule } from '../companies/companies.module';
import { UsersModule } from '../users/users.module';
import { Stage } from '../stages/entities/stage.entity';
import { TicketStage } from '../tickets/entities/ticket-stage.entity';
import { BusinessLineOption } from '../opportunities/entities/business-line-option.entity';
import { DeliveryTypeOption } from '../opportunities/entities/delivery-type-option.entity';
import { LicensingOption } from '../opportunities/entities/licensing-option.entity';
import { OpportunityLabel } from '../opportunities/entities/opportunity-label.entity';
import { TypeActivity } from '../activities/entities/type-activity.entity';
import { Client } from '../clients/entities/client.entity';
import { Company } from '../companies/entities/company.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Activity } from '../activities/entities/activity.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Stage,
      TicketStage,
      BusinessLineOption,
      DeliveryTypeOption,
      LicensingOption,
      OpportunityLabel,
      TypeActivity,
      Client,
      Company,
      Opportunity,
      Activity,
      Ticket,
      Product,
    ]),
    ConversationsModule,
    OpportunitiesModule,
    ActivitiesModule,
    TicketsModule,
    ClientsModule,
    CompaniesModule,
    UsersModule,
  ],
  controllers: [WebchatController],
  providers: [
    WebchatPromptBuilderService,
    WebchatQueryPlannerService,
    WebchatSecurityService,
    WebchatCubeExecutorService,
    WebchatEntityMatcherService,
    WebchatResponseFormatterService,
    WebchatActionExecutorService,
    WebchatService,
  ],
  exports: [
    WebchatService,
    WebchatCubeExecutorService,
    WebchatEntityMatcherService,
    WebchatSecurityService,
    WebchatActionExecutorService,
  ],
})
export class WebchatModule {}
