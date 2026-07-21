import { Module } from '@nestjs/common';
import { WebchatController } from './webchat.controller';
import { WebchatService } from './webchat.service';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [
    ConversationsModule, // Importa para reutilizar AiAgentService (callLLM, generateCubeToken)
  ],
  controllers: [WebchatController],
  providers: [WebchatService],
  exports: [WebchatService],
})
export class WebchatModule {}
