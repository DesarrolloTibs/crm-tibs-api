import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Pipeline } from './entities/pipeline.entity';
import { Stage } from '../stages/entities/stage.entity';

@Injectable()
export class PipelinesService {
  constructor(
    @InjectRepository(Pipeline)
    private readonly pipelineRepository: Repository<Pipeline>,
    @InjectRepository(Stage)
    private readonly stageRepository: Repository<Stage>,
    private readonly dataSource: DataSource,
  ) {}

  async getMainPipeline(): Promise<Pipeline> {
    const pipeline = await this.pipelineRepository.findOne({
      where: {},
      order: { dtmcreated: 'ASC' },
      relations: ['stages'],
    });

    if (!pipeline) {
      throw new NotFoundException('El Pipeline Principal no existe.');
    }

    // Sort stages by display_order
    pipeline.stages = pipeline.stages.sort((a, b) => a.display_order - b.display_order);
    return pipeline;
  }

  async getActiveStagesOfMainPipeline(): Promise<Stage[]> {
    const pipeline = await this.getMainPipeline();
    return pipeline.stages.filter(s => s.blnstatus);
  }

  async updateMainPipeline(
    updateDto: {
      strname?: string;
      strdescription?: string;
      blnstatus?: boolean;
      stages?: Array<{
        id?: string;
        strname: string;
        blnstatus: boolean;
        display_order: number;
        strcolor?: string | null;
        blninitial: boolean;
        intmaxdays?: number | null;
      }>;
    }
  ): Promise<Pipeline> {
    const pipeline = await this.pipelineRepository.findOne({
      where: {},
      order: { dtmcreated: 'ASC' },
      relations: ['stages'],
    });

    if (!pipeline) {
      throw new NotFoundException('El Pipeline Principal no existe.');
    }

    // 1. Update pipeline fields if provided
    if (updateDto.strname) pipeline.strname = updateDto.strname;
    if (updateDto.strdescription !== undefined) pipeline.strdescription = updateDto.strdescription;
    if (updateDto.blnstatus !== undefined) pipeline.blnstatus = updateDto.blnstatus;

    // 2. If stage configuration is provided, validate it
    const stagesInput = updateDto.stages;
    if (stagesInput) {
      const activeStages = stagesInput.filter(s => s.blnstatus);

      // Validation A: Debe existir al menos una etapa activa
      if (activeStages.length === 0) {
        throw new BadRequestException('Debe existir al menos una etapa activa en el pipeline.');
      }

      // Validation B: Debe existir exactamente una etapa inicial activa
      const initialActiveStages = activeStages.filter(s => s.blninitial);
      if (initialActiveStages.length !== 1) {
        throw new BadRequestException('Debe existir exactamente una etapa inicial activa en el pipeline.');
      }

      // Validation C: No se permiten nombres duplicados
      const names = stagesInput.map(s => s.strname.trim().toLowerCase());
      const uniqueNames = new Set(names);
      if (names.length !== uniqueNames.size) {
        throw new BadRequestException('No se permiten nombres duplicados de etapas dentro del mismo pipeline.');
      }

      // Perform updates inside a transaction
      await this.dataSource.transaction(async (manager) => {
        // Save pipeline details
        await manager.save(Pipeline, pipeline);

        // Process stages
        for (const stageInput of stagesInput) {
          let stage: Stage;
          if (stageInput.id) {
            const foundStage = await manager.findOne(Stage, { where: { id: stageInput.id } });
            if (!foundStage) {
              throw new NotFoundException(`La etapa con ID ${stageInput.id} no existe.`);
            }
            stage = foundStage;
          } else {
            stage = new Stage();
            stage.pipeline_id = pipeline.id;
          }

          stage.strname = stageInput.strname.trim();
          stage.blnstatus = stageInput.blnstatus;
          stage.display_order = stageInput.display_order;
          stage.strcolor = stageInput.strcolor || null;
          stage.blninitial = stageInput.blninitial;
          stage.intmaxdays = stageInput.intmaxdays ?? null;
          stage.dtmlastmodified = new Date();

          await manager.save(Stage, stage);
        }
      });
    } else {
      // Save pipeline details without stages
      await this.pipelineRepository.save(pipeline);
    }

    // Return updated pipeline
    return this.getMainPipeline();
  }
}
