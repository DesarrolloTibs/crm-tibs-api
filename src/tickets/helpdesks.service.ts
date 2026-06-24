import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Helpdesk } from './entities/helpdesk.entity';
import { TicketStage } from './entities/ticket-stage.entity';
import { Ticket } from './entities/ticket.entity';
import { HelpdeskCronConfig } from './entities/helpdesk-cron-config.entity';
import { UpdateHelpdeskCronConfigDto } from './dto/update-helpdesk-cron-config.dto';
import { NotificationsSchedulerService } from '../notifications/notifications.scheduler.service';

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
    @Inject(forwardRef(() => NotificationsSchedulerService))
    private readonly schedulerService: NotificationsSchedulerService,
  ) {}

  async getMainHelpdesk(): Promise<Helpdesk & { stages: TicketStage[] }> {
    const helpdesk = await this.helpdeskRepository.findOne({
      where: {},
      order: { dtmcreated: 'ASC' },
    });

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
    await this.schedulerService.rescheduleUnattendedTicketsCron();

    return saved;
  }
}
