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
    // Asegurar que la columna exista en el schema del tenant activo
    await this.dataSource.query('ALTER TABLE tblstagescatalog ADD COLUMN IF NOT EXISTS "stage_type" integer NOT NULL DEFAULT 0;').catch(() => null);

    let pipeline = await this.pipelineRepository.findOne({
      where: {},
      order: { dtmcreated: 'ASC' },
      relations: ['stages'],
    });

    if (!pipeline) {
      // Lazy auto-seeding de Pipeline Comercial por defecto para bases de datos limpias (ej. Supabase nueva)
      await this.dataSource.transaction(async (manager) => {
        const newPipeline = new Pipeline();
        newPipeline.strname = 'Pipeline Comercial Principal';
        newPipeline.strdescription = 'Pipeline por defecto para gestionar oportunidades comerciales.';
        newPipeline.blnstatus = true;
        newPipeline.dtmcreated = new Date();
        newPipeline.dtmlastmodified = new Date();
        const savedPipeline = await manager.save(Pipeline, newPipeline);

        const defaultStages = [
          { strname: 'Prospecto', display_order: 1, blninitial: true, strcolor: '#3498db', bln_show_dashboard: true, stage_type: 0 },
          { strname: 'Calificado', display_order: 2, blninitial: false, strcolor: '#f1c40f', bln_show_dashboard: true, stage_type: 0 },
          { strname: 'Propuesta', display_order: 3, blninitial: false, strcolor: '#9b59b6', bln_show_dashboard: true, stage_type: 0 },
          { strname: 'Negociación', display_order: 4, blninitial: false, strcolor: '#e67e22', bln_show_dashboard: true, stage_type: 0 },
          { strname: 'Cierre Exitoso', display_order: 5, blninitial: false, strcolor: '#2ecc71', bln_show_dashboard: true, stage_type: 1 },
          { strname: 'Cierre Perdido', display_order: 6, blninitial: false, strcolor: '#e74c3c', bln_show_dashboard: false, stage_type: 2 }
        ];

        for (const ds of defaultStages) {
          const stage = new Stage();
          stage.pipeline_id = savedPipeline.id;
          stage.strname = ds.strname;
          stage.display_order = ds.display_order;
          stage.blninitial = ds.blninitial;
          stage.blnstatus = true;
          stage.strcolor = ds.strcolor;
          stage.bln_show_dashboard = ds.bln_show_dashboard;
          stage.stage_type = ds.stage_type;
          stage.dtmcreated = new Date();
          stage.dtmlastmodified = new Date();
          await manager.save(Stage, stage);
        }
      });

      // Volver a consultar el pipeline con sus etapas insertadas
      pipeline = await this.pipelineRepository.findOne({
        where: {},
        order: { dtmcreated: 'ASC' },
        relations: ['stages'],
      });
    }

    if (!pipeline) {
      throw new NotFoundException('El Pipeline Principal no existe.');
    }

    // Auto-backfill inteligente para stages existentes sin stage_type definido
    for (const st of pipeline.stages) {
      const nameLower = (st.strname || '').toLowerCase();
      if (st.stage_type === undefined || st.stage_type === null || st.stage_type === 0) {
        if (
          nameLower.includes('éxito') ||
          nameLower.includes('exito') ||
          nameLower.includes('exitoso') ||
          nameLower.includes('ganad') ||
          nameLower.includes('cerrada ganada') ||
          nameLower.includes('won')
        ) {
          st.stage_type = 1;
          await this.stageRepository.update(st.id, { stage_type: 1 });
        } else if (
          nameLower.includes('perdid') ||
          nameLower.includes('cancelad') ||
          nameLower.includes('descartad') ||
          nameLower.includes('cerrada perdida') ||
          nameLower.includes('lost')
        ) {
          st.stage_type = 2;
          await this.stageRepository.update(st.id, { stage_type: 2 });
        }
      }
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
        bln_show_dashboard?: boolean;
        stage_type?: number;
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

      // Validation D: Máximo 1 etapa Ganada (1) y máximo 1 etapa Perdida (2) por pipeline
      const wonStages = activeStages.filter(s => s.stage_type === 1);
      if (wonStages.length > 1) {
        throw new BadRequestException('Solo puede existir un máximo de una etapa Ganada (stage_type: 1) por pipeline.');
      }
      const lostStages = activeStages.filter(s => s.stage_type === 2);
      if (lostStages.length > 1) {
        throw new BadRequestException('Solo puede existir un máximo de una etapa Perdida (stage_type: 2) por pipeline.');
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
          if (stageInput.strcolor !== undefined) {
            stage.strcolor = stageInput.strcolor || null;
          }
          stage.blninitial = stageInput.blninitial;
          if (stageInput.intmaxdays !== undefined) {
            stage.intmaxdays = stageInput.intmaxdays;
          }
          if (stageInput.bln_show_dashboard !== undefined) {
            stage.bln_show_dashboard = stageInput.bln_show_dashboard;
          }
          if (stageInput.stage_type !== undefined) {
            stage.stage_type = stageInput.stage_type;
          }
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

  async findAll(): Promise<Pipeline[]> {
    const pipelines = await this.pipelineRepository.find({
      relations: ['stages'],
      order: { dtmcreated: 'ASC' },
    });
    for (const p of pipelines) {
      p.stages = p.stages.sort((a, b) => a.display_order - b.display_order);
    }
    return pipelines;
  }
}
