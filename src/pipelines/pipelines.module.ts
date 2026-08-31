import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pipeline } from './entities/pipeline.entity';
import { Stage } from '../stages/entities/stage.entity';
import { PipelinesService } from './pipelines.service';
import { PipelinesController } from './pipelines.controller';

import { PipelinesGateway } from './pipelines.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Pipeline, Stage])],
  providers: [PipelinesService, PipelinesGateway],
  controllers: [PipelinesController],
  exports: [PipelinesService, PipelinesGateway],
})
export class PipelinesModule {}

