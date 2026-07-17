import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { AiAgentConfig } from '../conversations/entities/ai-agent-config.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiAgentConfig]),
    ConfigModule,
  ],
  providers: [RagService],
  controllers: [RagController],
  exports: [RagService],
})
export class RagModule {}
