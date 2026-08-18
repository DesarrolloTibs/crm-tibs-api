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
import { ConversationsModule } from '../conversations/conversations.module';
import { Stage } from '../stages/entities/stage.entity';
import { TicketStage } from '../tickets/entities/ticket-stage.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stage, TicketStage]),
    ConversationsModule,
  ],
  controllers: [WebchatController],
  providers: [
    WebchatPromptBuilderService,
    WebchatQueryPlannerService,
    WebchatSecurityService,
    WebchatCubeExecutorService,
    WebchatEntityMatcherService,
    WebchatResponseFormatterService,
    WebchatService,
  ],
  exports: [
    WebchatService,
    WebchatCubeExecutorService,
    WebchatEntityMatcherService,
    WebchatSecurityService,
  ],
})
export class WebchatModule {}
