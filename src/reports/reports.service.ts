import { Injectable, OnModuleInit, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DashboardIndicator } from './entities/dashboard-indicator.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Activity } from '../Activities/entities/activity.entity';
import { Pipeline } from '../pipelines/entities/pipeline.entity';
import { Helpdesk } from '../tickets/entities/helpdesk.entity';
import { Stage } from '../stages/entities/stage.entity';
import { TicketStage } from '../tickets/entities/ticket-stage.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';
import { UsersService } from '../users/users.service';

@Injectable()
export class ReportsService implements OnModuleInit {
  constructor(
    @InjectRepository(DashboardIndicator)
    private readonly indicatorRepository: Repository<DashboardIndicator>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Pipeline)
    private readonly pipelineRepository: Repository<Pipeline>,
    @InjectRepository(Helpdesk)
    private readonly helpdeskRepository: Repository<Helpdesk>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.indicatorRepository.count();
      if (count > 0) {
        return;
      }

      console.log('Seeding default dashboard indicators...');

      // 1. Seed indicators for existing pipelines
      const pipelines = await this.pipelineRepository.find({ relations: ['stages'] });
      for (const pipeline of pipelines) {
        const stages = pipeline.stages;
        const ganadaStage = stages.find(s => s.strname.toLowerCase() === 'ganada');
        const perdidaStage = stages.find(s => s.strname.toLowerCase() === 'perdida');
        const canceladaStage = stages.find(s => s.strname.toLowerCase() === 'cancelada');
        
        const openStages = stages.filter(s => 
          !['ganada', 'perdida', 'cancelada', 'standby'].includes(s.strname.toLowerCase())
        );

        // Indicator A: Citas Agendadas
        const citaStage = stages.find(s => s.strname.toLowerCase().includes('cita'));
        await this.indicatorRepository.save(this.indicatorRepository.create({
          title: 'Citas Agendadas',
          type: 'count',
          pipeline_id: pipeline.id,
          stage_ids: citaStage ? [citaStage.id] : [],
          color: 'purple',
          display_order: 1,
        }));

        // Indicator B: Oportunidades Abiertas
        await this.indicatorRepository.save(this.indicatorRepository.create({
          title: 'Oportunidades Abiertas',
          type: 'count',
          pipeline_id: pipeline.id,
          stage_ids: openStages.map(s => s.id),
          color: 'blue',
          display_order: 2,
        }));

        // Indicator C: Oportunidades Ganadas
        await this.indicatorRepository.save(this.indicatorRepository.create({
          title: 'Oportunidades Ganadas',
          type: 'count',
          pipeline_id: pipeline.id,
          stage_ids: ganadaStage ? [ganadaStage.id] : [],
          color: 'green',
          display_order: 3,
        }));

        // Indicator D: Oportunidades Perdidas
        const lostIds: string[] = [];
        if (perdidaStage) lostIds.push(perdidaStage.id);
        if (canceladaStage) lostIds.push(canceladaStage.id);
        await this.indicatorRepository.save(this.indicatorRepository.create({
          title: 'Oportunidades Perdidas',
          type: 'count',
          pipeline_id: pipeline.id,
          stage_ids: lostIds,
          color: 'red',
          display_order: 4,
        }));

        // Indicator E: Ventas
        await this.indicatorRepository.save(this.indicatorRepository.create({
          title: 'Ventas',
          type: 'sum',
          pipeline_id: pipeline.id,
          stage_ids: ganadaStage ? [ganadaStage.id] : [],
          color: 'orange',
          display_order: 5,
        }));
      }

      // 2. Seed indicators for existing helpdesks
      const helpdesks = await this.helpdeskRepository.find({ relations: ['stages'] });
      for (const helpdesk of helpdesks) {
        const stages = helpdesk.stages;
        const resueltoStage = stages.find((s: any) => s.strname.toLowerCase() === 'resuelto');
        const canceladoStage = stages.find((s: any) => s.strname.toLowerCase() === 'cancelado');
        const abiertoStages = stages.filter((s: any) => 
          !['resuelto', 'cancelado'].includes(s.strname.toLowerCase())
        );

        // Support KPI A: Total Tickets
        await this.indicatorRepository.save(this.indicatorRepository.create({
          title: 'Total Tickets',
          type: 'count',
          helpdesk_id: helpdesk.id,
          stage_ids: stages.map((s: any) => s.id),
          color: 'blue',
          display_order: 1,
        }));

        // Support KPI B: Tickets Abiertos
        await this.indicatorRepository.save(this.indicatorRepository.create({
          title: 'Tickets Abiertos',
          type: 'count',
          helpdesk_id: helpdesk.id,
          stage_ids: abiertoStages.map((s: any) => s.id),
          color: 'purple',
          display_order: 2,
        }));

        // Support KPI C: Tickets Resueltos
        await this.indicatorRepository.save(this.indicatorRepository.create({
          title: 'Tickets Resueltos',
          type: 'count',
          helpdesk_id: helpdesk.id,
          stage_ids: resueltoStage ? [resueltoStage.id] : [],
          color: 'green',
          display_order: 3,
        }));
      }

      console.log('Seeded default indicators successfully.');
    } catch (err) {
      console.error('Failed to seed dashboard indicators:', err);
    }
  }

  // --- CRUD INDICATORS ---

  async findAllIndicators(): Promise<DashboardIndicator[]> {
    return this.indicatorRepository.find({ order: { display_order: 'ASC', title: 'ASC' } });
  }

  async createIndicator(dto: Partial<DashboardIndicator>): Promise<DashboardIndicator> {
    const indicator = this.indicatorRepository.create(dto);
    return this.indicatorRepository.save(indicator);
  }

  async updateIndicator(id: string, dto: Partial<DashboardIndicator>): Promise<DashboardIndicator> {
    const indicator = await this.indicatorRepository.findOne({ where: { id } });
    if (!indicator) {
      throw new NotFoundException(`Indicador con ID "${id}" no encontrado.`);
    }
    Object.assign(indicator, dto);
    return this.indicatorRepository.save(indicator);
  }

  async deleteIndicator(id: string): Promise<void> {
    const result = await this.indicatorRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Indicador con ID "${id}" no encontrado.`);
    }
  }

  // --- REPORT SUMMARY DATA ---

  async getDashboardData(currentUser: User) {
    const currentUserId = currentUser.id || (currentUser as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario actual.');
    }

    const fullCurrentUser = await this.usersService.findOneById(currentUserId);
    const isAdmin = fullCurrentUser.role === Role.Admin;

    // 1. Fetch Indicators
    const indicators = await this.findAllIndicators();

    // 2. Fetch Pipelines and Helpdesks (with stages)
    const pipelines = await this.pipelineRepository.find({
      relations: ['stages'],
      order: { dtmcreated: 'ASC' },
    });
    for (const p of pipelines) {
      if (p.stages) {
        p.stages = p.stages.sort((a: any, b: any) => a.display_order - b.display_order);
      }
    }

    const helpdesks = await this.helpdeskRepository.find({
      relations: ['stages'],
      order: { dtmcreated: 'ASC' },
    });
    for (const h of helpdesks) {
      if (h.stages) {
        h.stages = h.stages.sort((a: any, b: any) => a.display_order - b.display_order);
      }
    }

    // 3. Fetch Opportunities
    const oppQb = this.opportunityRepository.createQueryBuilder('opportunity')
      .leftJoinAndSelect('opportunity.stage', 'stage')
      .leftJoinAndSelect('opportunity.cliente', 'cliente')
      .leftJoinAndSelect('opportunity.ejecutivo', 'ejecutivo')
      .leftJoinAndSelect('opportunity.company', 'company')
      .where('opportunity.archived = :showArchived', { showArchived: false });

    if (!isAdmin) {
      oppQb.andWhere('opportunity.ejecutivo_id = :userId', { userId: fullCurrentUser.id });
    }
    const opportunities = await oppQb.getMany();

    // 4. Fetch Tickets
    const ticketQb = this.ticketRepository.createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.stage', 'stage')
      .leftJoinAndSelect('ticket.cliente', 'cliente')
      .leftJoinAndSelect('ticket.responsable', 'responsable')
      .leftJoinAndSelect('ticket.helpdesk', 'helpdesk')
      .where('ticket.archived = :showArchived', { showArchived: false });

    if (!isAdmin) {
      ticketQb.andWhere('ticket.responsable_id = :userId', { userId: fullCurrentUser.id });
    }
    const tickets = await ticketQb.getMany();

    // 5. Fetch Activities
    const actQb = this.activityRepository.createQueryBuilder('activity')
      .leftJoinAndSelect('activity.typeActivity', 'typeActivity')
      .leftJoinAndSelect('activity.opportunity', 'opportunity')
      .leftJoinAndSelect('activity.client', 'client')
      .leftJoinAndSelect('activity.company', 'company')
      .leftJoinAndSelect('activity.user', 'user');

    if (!isAdmin) {
      // Filter activities identical to activitiesService.findAll:
      // executive can see what they created, or what belongs to their assigned opp/client/company
      actQb.andWhere(
        `(
          activity.userId = :userId
          OR opportunity.ejecutivo_id = :userId
          OR client.ejecutivo_id = :userId
          OR company.ejecutivo_id = :userId
        )`,
        { userId: fullCurrentUser.id }
      );
    }
    const activities = await actQb.orderBy('activity.date', 'DESC').getMany();

    // 6. Fetch all executives list (only for Admin to populate dashboard filters)
    let executives: Partial<User>[] = [];
    if (isAdmin) {
      executives = await this.userRepository.find({
        select: ['id', 'username', 'email', 'role'],
        order: { username: 'ASC' },
      });
    }

    return {
      indicators,
      pipelines,
      helpdesks,
      opportunities,
      tickets,
      activities,
      executives,
    };
  }
}
