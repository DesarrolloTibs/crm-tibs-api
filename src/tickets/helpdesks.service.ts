import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Helpdesk } from './entities/helpdesk.entity';
import { TicketStage } from './entities/ticket-stage.entity';
import { Ticket } from './entities/ticket.entity';
import { HelpdeskCronConfig } from './entities/helpdesk-cron-config.entity';
import { UpdateHelpdeskCronConfigDto } from './dto/update-helpdesk-cron-config.dto';
import { SCHEDULER_EVENTS } from '../common/events/scheduler.events';

@Injectable()
export class HelpdesksService {
  constructor(
    @InjectRepository(Helpdesk)
    private readonly helpdeskRepository: Repository<Helpdesk>,
    @InjectRepository(TicketStage)
    private readonly stageRepository: Repository<TicketStage>,
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(HelpdeskCronConfig)
    private readonly cronConfigRepository: Repository<HelpdeskCronConfig>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getMainHelpdesk(): Promise<Helpdesk & { stages: TicketStage[] }> {
    let helpdesk = await this.helpdeskRepository.findOne({
      where: {},
      order: { dtmcreated: 'ASC' },
    });

    if (!helpdesk) {
      // Lazy auto-seeding de Mesa de Ayuda por defecto para bases de datos limpias (ej. Supabase nueva)
      await this.dataSource.transaction(async (manager) => {
        const newHelpdesk = new Helpdesk();
        newHelpdesk.strname = 'Mesa de Ayuda Principal';
        newHelpdesk.strdescription = 'Canal principal para soporte técnico y atención a clientes.';
        newHelpdesk.dtmcreated = new Date();
        newHelpdesk.dtmlastmodified = new Date();
        const savedHelpdesk = await manager.save(Helpdesk, newHelpdesk);

        const defaultStages = [
          { strname: 'Nuevo', display_order: 1, blninitial: true, strcolor: '#e74c3c', bln_show_dashboard: true },
          { strname: 'En Proceso', display_order: 2, blninitial: false, strcolor: '#f1c40f', bln_show_dashboard: true },
          { strname: 'En Espera', display_order: 3, blninitial: false, strcolor: '#3498db', bln_show_dashboard: true },
          { strname: 'Resuelto', display_order: 4, blninitial: false, strcolor: '#2ecc71', bln_show_dashboard: true }
        ];

        for (const ds of defaultStages) {
          const stage = new TicketStage();
          stage.helpdesk_id = savedHelpdesk.id;
          stage.strname = ds.strname;
          stage.display_order = ds.display_order;
          stage.blninitial = ds.blninitial;
          stage.blnstatus = true;
          stage.strcolor = ds.strcolor;
          stage.bln_show_dashboard = ds.bln_show_dashboard;
          stage.dtmcreated = new Date();
          stage.dtmlastmodified = new Date();
          await manager.save(TicketStage, stage);
        }
      });

      // Volver a consultar
      helpdesk = await this.helpdeskRepository.findOne({
        where: {},
        order: { dtmcreated: 'ASC' },
      });
    }

    if (!helpdesk) {
      throw new NotFoundException('La Mesa de Ayuda Principal no existe en la base de datos.');
    }

    const stages = await this.stageRepository.find({
      where: { helpdesk_id: helpdesk.id },
      order: { display_order: 'ASC' },
    });

    return {
      ...helpdesk,
      stages,
    };
  }

  async getActiveStages(): Promise<TicketStage[]> {
    const helpdesk = await this.getMainHelpdesk();
    return helpdesk.stages.filter(s => s.blnstatus);
  }

  async updateMainHelpdesk(
    updateDto: {
      strname?: string;
      strdescription?: string;
      stages?: Array<{
        id?: string;
        strname: string;
        blnstatus: boolean;
        display_order: number;
        strcolor?: string | null;
        blninitial: boolean;
        intmaxdays?: number | null;
        bln_show_dashboard?: boolean;
      }>;
    }
  ): Promise<Helpdesk & { stages: TicketStage[] }> {
    const helpdesk = await this.helpdeskRepository.findOne({
      where: {},
      order: { dtmcreated: 'ASC' },
    });

    if (!helpdesk) {
      throw new NotFoundException('La Mesa de Ayuda Principal no existe.');
    }

    if (updateDto.strname) helpdesk.strname = updateDto.strname;
    if (updateDto.strdescription !== undefined) helpdesk.strdescription = updateDto.strdescription;

    const stagesInput = updateDto.stages;

    if (stagesInput) {
      const activeStages = stagesInput.filter(s => s.blnstatus);

      // A. Al menos una etapa activa
      if (activeStages.length === 0) {
        throw new BadRequestException('Debe existir al menos una etapa activa.');
      }

      // B. Exactamente una etapa inicial activa
      const initialActiveStages = activeStages.filter(s => s.blninitial);
      if (initialActiveStages.length !== 1) {
        throw new BadRequestException('Debe existir exactamente una etapa inicial activa.');
      }

      // C. Nombres únicos
      const names = stagesInput.map(s => s.strname.trim().toLowerCase());
      const uniqueNames = new Set(names);
      if (names.length !== uniqueNames.size) {
        throw new BadRequestException('No se permiten nombres de etapas duplicados.');
      }

      // D. Nombres no vacíos
      if (stagesInput.some(s => !s.strname.trim())) {
        throw new BadRequestException('El nombre de todas las etapas debe estar completo.');
      }

      // Transacción
      await this.dataSource.transaction(async (manager) => {
        // Guardar mesa de ayuda
        await manager.save(Helpdesk, helpdesk);

        // Buscar etapas actuales
        const currentDbStages = await manager.find(TicketStage, {
          where: { helpdesk_id: helpdesk.id }
        });

        // Identificar etapas eliminadas (existen en la base de datos pero no en el input)
        const inputIds = stagesInput.map(s => s.id).filter(Boolean);
        const deletedDbStages = currentDbStages.filter(s => !inputIds.includes(s.id));

        // Validar que no tengan tickets asignados
        for (const stageToDelete of deletedDbStages) {
          const ticketsInStage = await manager.count(Ticket, {
            where: { stage_id: stageToDelete.id }
          });
          if (ticketsInStage > 0) {
            throw new BadRequestException(
              `No se puede eliminar la etapa "${stageToDelete.strname}" porque tiene ${ticketsInStage} ticket(s) asociado(s).`
            );
          }
        }

        // Eliminar las etapas seleccionadas
        if (deletedDbStages.length > 0) {
          await manager.remove(TicketStage, deletedDbStages);
        }

        // Guardar/Actualizar etapas ingresadas
        for (const stageInput of stagesInput) {
          let stage: TicketStage;
          if (stageInput.id) {
            const found = await manager.findOne(TicketStage, { where: { id: stageInput.id } });
            if (!found) {
              throw new NotFoundException(`La etapa con ID ${stageInput.id} no existe.`);
            }
            stage = found;
          } else {
            stage = new TicketStage();
            stage.helpdesk_id = helpdesk.id;
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
          stage.dtmlastmodified = new Date();

          await manager.save(TicketStage, stage);
        }
      });
    } else {
      await this.helpdeskRepository.save(helpdesk);
    }

    return this.getMainHelpdesk();
  }

  /**
   * Obtiene la configuración del cron de la mesa de ayuda principal.
   * Si no existe, la crea con valores por defecto.
   */
  async getCronConfig(): Promise<HelpdeskCronConfig> {
    const helpdesk = await this.helpdeskRepository.findOne({
      where: {},
      order: { dtmcreated: 'ASC' },
    });
    if (!helpdesk) {
      throw new NotFoundException('La Mesa de Ayuda Principal no existe.');
    }

    let config = await this.cronConfigRepository.findOne({
      where: { helpdesk_id: helpdesk.id },
    });

    if (!config) {
      // Crear registro por defecto si aún no existe
      config = this.cronConfigRepository.create({
        helpdesk_id: helpdesk.id,
        cron_mode: 'fixed',
        cron_time: '08:00',
        cron_interval_hours: null,
        cron_interval_minutes: null,
        blnstatus: true,
      });
      config = await this.cronConfigRepository.save(config);
    }

    return config;
  }

  /**
   * Guarda (crea o actualiza) la configuración del cron de la mesa de ayuda principal.
   */
  async saveCronConfig(dto: UpdateHelpdeskCronConfigDto): Promise<HelpdeskCronConfig> {
    const helpdesk = await this.helpdeskRepository.findOne({
      where: {},
      order: { dtmcreated: 'ASC' },
    });
    if (!helpdesk) {
      throw new NotFoundException('La Mesa de Ayuda Principal no existe.');
    }

    // Validación de intervalo mínimo
    if (dto.cron_mode === 'interval') {
      const hours = dto.cron_interval_hours ?? 0;
      const minutes = dto.cron_interval_minutes ?? 0;
      if (hours === 0 && minutes === 0) {
        throw new BadRequestException('El intervalo debe ser de al menos 1 minuto.');
      }
    }

    let config = await this.cronConfigRepository.findOne({
      where: { helpdesk_id: helpdesk.id },
    });

    if (!config) {
      config = this.cronConfigRepository.create({ helpdesk_id: helpdesk.id, blnstatus: true });
    }

    config.cron_mode = dto.cron_mode;
    config.cron_time = dto.cron_mode === 'fixed' ? (dto.cron_time ?? '08:00') : null;
    config.cron_interval_hours = dto.cron_mode === 'interval' ? (dto.cron_interval_hours ?? 0) : null;
    config.cron_interval_minutes = dto.cron_mode === 'interval' ? (dto.cron_interval_minutes ?? 0) : null;
    config.dtmlastmodified = new Date();

    const saved = await this.cronConfigRepository.save(config);

    // Reprogramar el cron job en caliente con la nueva configuración
    this.eventEmitter.emit(SCHEDULER_EVENTS.RESCHEDULE_UNATTENDED_TICKETS);

    return saved;
  }

  async findAll(): Promise<Helpdesk[]> {
    const helpdesks = await this.helpdeskRepository.find({
      relations: ['stages'],
      order: { dtmcreated: 'ASC' },
    });
    for (const h of helpdesks) {
      if (h.stages) {
        h.stages = h.stages.sort((a: any, b: any) => a.display_order - b.display_order);
      }
    }
    return helpdesks;
  }
}
