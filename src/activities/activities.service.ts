import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Role } from '../role.enum';
import { UsersService } from 'src/users/users.service';
import { Activity } from './entities/activity.entity';
import { CreateActivityDto } from './dto/create-activity.dto';
import { TypeActivity } from './entities/type-activity.entity';
import { InteractionsService } from 'src/interactions/interactions.service';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CreateTypeActivityDto } from './dto/create-type-activity.dto';
import { UpdateTypeActivityDto } from './dto/update-type-activity.dto';
import { Client } from 'src/clients/entities/client.entity';
import { RemindersService } from 'src/reminders/reminders.service';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger('ActivitiesService');

  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(TypeActivity)
    private readonly typeActivityRepository: Repository<TypeActivity>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly usersService: UsersService,
    private readonly interactionsService: InteractionsService,
    private readonly remindersService: RemindersService,
    private readonly notificationsService: NotificationsService,
  ) { }


  private fillDeletedType(activity: Activity): Activity {
    if (activity && !activity.typeActivity) {
      activity.typeActivity = {
        id: null as any,
        strname: 'Tipo de actividad eliminada',
        blnstatus: false,
      } as TypeActivity;
    }
    return activity;
  }

  async findAllTypes(): Promise<TypeActivity[]> {
    return this.typeActivityRepository.find({ order: { strname: 'ASC' } });
  }

  /**
   * Obtiene todas las actividades de un asesor en un rango de fecha/hora.
   * Utilizado por el Agente IA para verificar disponibilidad antes de agendar.
   */
  async findByUserAndDate(userId: string, dateStart: Date, dateEnd: Date): Promise<Activity[]> {
    return this.activityRepository.createQueryBuilder('activity')
      .where('activity.userId = :userId', { userId })
      .andWhere('activity.date >= :dateStart', { dateStart })
      .andWhere('activity.date <= :dateEnd', { dateEnd })
      .getMany();
  }

  async createType(
    createTypeActivityDto: CreateTypeActivityDto,
    user: User,
  ): Promise<TypeActivity> {
    const currentUserId = user.id || (user as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario.');
    }
    const fullCurrentUser = await this.usersService.findOneById(currentUserId);
    if (fullCurrentUser.role !== Role.Admin && fullCurrentUser.role !== Role.SuperAdmin && (fullCurrentUser.role as string) !== 'superadmin') {
      throw new ForbiddenException('Solo los administradores pueden crear tipos de actividad.');
    }

    if (createTypeActivityDto.strname.trim().toLowerCase() === 'tipo de actividad eliminada') {
      throw new BadRequestException('No se puede crear un tipo de actividad con el nombre reservado.');
    }

    const typeActivity = this.typeActivityRepository.create({
      strname: createTypeActivityDto.strname,
      blnstatus: createTypeActivityDto.blnstatus ?? true,
    });
    return this.typeActivityRepository.save(typeActivity);
  }

  async updateType(
    id: number,
    updateTypeActivityDto: UpdateTypeActivityDto,
    user: User,
  ): Promise<TypeActivity> {
    const currentUserId = user.id || (user as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario.');
    }
    const fullCurrentUser = await this.usersService.findOneById(currentUserId);
    if (fullCurrentUser.role !== Role.Admin && fullCurrentUser.role !== Role.SuperAdmin && (fullCurrentUser.role as string) !== 'superadmin') {
      throw new ForbiddenException('Solo los administradores pueden actualizar tipos de actividad.');
    }

    const originalType = await this.typeActivityRepository.findOne({ where: { id } });
    if (!originalType) {
      throw new NotFoundException(`Tipo de actividad con ID "${id}" no encontrado.`);
    }

    if (originalType.strname.toLowerCase() === 'tipo de actividad eliminada') {
      throw new ForbiddenException('No se puede modificar el tipo de actividad predeterminado.');
    }

    if (
      updateTypeActivityDto.strname &&
      updateTypeActivityDto.strname.trim().toLowerCase() === 'tipo de actividad eliminada'
    ) {
      throw new BadRequestException('No se puede usar el nombre reservado.');
    }

    const typeActivity = await this.typeActivityRepository.preload({
      id,
      ...updateTypeActivityDto,
    });
    if (!typeActivity) {
      throw new NotFoundException(`Tipo de actividad con ID "${id}" no encontrado para actualizar.`);
    }
    return this.typeActivityRepository.save(typeActivity);
  }

  async removeType(id: number, user: User): Promise<void> {
    const currentUserId = user.id || (user as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario.');
    }
    const fullCurrentUser = await this.usersService.findOneById(currentUserId);
    if (fullCurrentUser.role !== Role.Admin && fullCurrentUser.role !== Role.SuperAdmin && (fullCurrentUser.role as string) !== 'superadmin') {
      throw new ForbiddenException('Solo los administradores pueden eliminar tipos de actividad.');
    }


    const typeToDelete = await this.typeActivityRepository.findOne({ where: { id } });
    if (!typeToDelete) {
      throw new NotFoundException(`Tipo de actividad con ID "${id}" no encontrado.`);
    }

    if (typeToDelete.strname.toLowerCase() === 'tipo de actividad eliminada') {
      throw new ForbiddenException('No se puede eliminar el tipo de actividad predeterminado.');
    }

    const result = await this.typeActivityRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Tipo de actividad con ID "${id}" no encontrado.`);
    }
  }

  async create(
    createActivityDto: CreateActivityDto,
    user: User,
  ): Promise<Activity> {
    this.logger.log(`Attempting to create activity. User object received: ${JSON.stringify(user)}`);

    const userId = user.id || (user as any).userId;

    if (!user || !userId) {
      this.logger.error('User object is invalid or missing an identifier (id or userId).', { user });
      throw new InternalServerErrorException(
        'No se pudo obtener la información del usuario para crear la actividad.',
      );
    }

    const { contactIds, ...dtoWithoutContacts } = createActivityDto;

    if (dtoWithoutContacts.opportunityId === '') {
      dtoWithoutContacts.opportunityId = null;
    }

    if (dtoWithoutContacts.clientId === '') {
      dtoWithoutContacts.clientId = null;
    }

    if (dtoWithoutContacts.companyId === '') {
      dtoWithoutContacts.companyId = null;
    }

    const activity = this.activityRepository.create({
      ...dtoWithoutContacts,
      user: { id: userId } as User,
    });

    if (contactIds && contactIds.length > 0) {
      activity.contacts = await this.clientRepository.find({
        where: contactIds.map(id => ({ id }))
      });
    } else if (dtoWithoutContacts.clientId) {
      activity.contacts = await this.clientRepository.find({
        where: { id: dtoWithoutContacts.clientId }
      });
    }

    const savedActivity = await this.activityRepository.save(activity);

    // Registrar la creación de la actividad en el historial de la oportunidad
    if (savedActivity.opportunityId) {
      const fullUser = await this.usersService.findOneById(userId).catch(() => null);
      const username = fullUser?.username || 'Sistema';
      const typeAct = savedActivity.typeActivityId
        ? await this.typeActivityRepository.findOne({ where: { id: savedActivity.typeActivityId } })
        : null;
      const typeName = typeAct ? typeAct.strname : 'Actividad';
      const comment = `El usuario ${username} creó una actividad de tipo "${typeName}": "${savedActivity.activity}"`;
      await this.interactionsService.create({
        opportunity_id: savedActivity.opportunityId,
        comment,
      });
    }

    // Gestionar recordatorio
    if (createActivityDto.reminder) {
      await this.remindersService.upsertForActivity(savedActivity.id, createActivityDto.reminder);
    }

    const result = await this.activityRepository.findOne({
      where: { id: savedActivity.id },
      relations: ['user', 'opportunity', 'client', 'company', 'contacts'],
    });
    if (result) {
      (result as any).reminder = await this.remindersService.findByActivity(savedActivity.id);

      // Notificar al ejecutivo asignado a la oportunidad
      if (result.opportunity && result.opportunity.ejecutivo_id) {
        const fullUser = await this.usersService.findOneById(userId);
        const username = fullUser?.username || 'Sistema';
        const typeAct = result.typeActivityId
          ? await this.typeActivityRepository.findOne({ where: { id: result.typeActivityId } })
          : null;
        const typeName = typeAct ? typeAct.strname : 'Actividad';

        const activityMessage = `El usuario <strong>${username}</strong> creó una nueva actividad de tipo <strong>${typeName}</strong> para la oportunidad <strong>${result.opportunity.nombre_proyecto}</strong>.<br/><br/>Actividad: <strong>${result.activity}</strong>.<br/><br/>Ingresa a la plataforma para consultar los detalles y dar el seguimiento correspondiente.`;

        await this.notificationsService.createAndSendNotification(
          result.opportunity.ejecutivo_id,
          'Nueva Actividad en Oportunidad',
          activityMessage,
          'activity_created',
          result.opportunity.id,
        );
      }
    }
    return this.fillDeletedType(result!);
  }

  async findAll(
    currentUser: User,
    userId?: string,
    opportunityId?: string,
  ): Promise<Activity[]> {
    const currentUserId = currentUser.id || (currentUser as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario actual.');
    }

    let fullCurrentUser: User = currentUser;
    try {
      fullCurrentUser = await this.usersService.findOneById(currentUserId);
    } catch (e) {
      fullCurrentUser = currentUser;
    }

    const options: FindManyOptions<Activity> = {
      where: {},
      relations: ['user', 'opportunity', 'client', 'company', 'contacts'],
      order: { date: 'DESC' },
    };

    if (fullCurrentUser.role !== Role.Admin && fullCurrentUser.role !== Role.SuperAdmin) {
      // Un ejecutivo puede ver:
      // 1. Actividades que él creó (userId === fullCurrentUser.id)
      // 2. Actividades de oportunidades que tiene asignadas (opportunity.ejecutivo_id === fullCurrentUser.id)
      // 3. Actividades de clientes que tiene asignados (client.ejecutivo_id === fullCurrentUser.id)
      // 4. Actividades de empresas que tiene asignadas (company.ejecutivo_id === fullCurrentUser.id)
      const clauses = [
        { userId: fullCurrentUser.id },
        { opportunity: { ejecutivo_id: fullCurrentUser.id } },
        { client: { ejecutivo_id: fullCurrentUser.id } },
        { company: { ejecutivo_id: fullCurrentUser.id } },
      ];
      if (opportunityId) {
        options.where = clauses.map(clause => ({
          ...clause,
          opportunityId,
        }));
      } else {
        options.where = clauses;
      }
    } else {
      const whereClause: any = {};
      if (userId) {

        whereClause.userId = userId;
      }
      if (opportunityId) {
        whereClause.opportunityId = opportunityId;
      }
      options.where = whereClause;
    }
    const activities = await this.activityRepository.find(options);

    // Adjuntar reminder a cada actividad
    const results = await Promise.all(
      activities.map(async (act) => {
        const filled = this.fillDeletedType(act);
        if (!filled.user && filled.userId) {
          filled.user = await this.usersService.findOneById(filled.userId).catch(() => null as any);
        }
        (filled as any).reminder = await this.remindersService.findByActivity(act.id);
        return filled;
      })
    );
    return results;
  }

  async update(
    id: string,
    updateActivityDto: UpdateActivityDto,
    user: User,
  ): Promise<Activity> {
    const currentUserId = user.id || (user as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario para la actualización.');
    }

    const [fullCurrentUser, originalActivity] = await Promise.all([
      this.usersService.findOneById(currentUserId),
      this.activityRepository.findOne({ where: { id } }),
    ]);

    if (!originalActivity) {
      throw new NotFoundException(`Actividad con ID "${id}" no encontrada.`);
    }

    if (fullCurrentUser.role !== Role.Admin && originalActivity.userId !== currentUserId) {
      throw new ForbiddenException('No tienes permiso para editar esta actividad.');
    }

    if (updateActivityDto.opportunityId === '') {
      updateActivityDto.opportunityId = null;
    }

    if (updateActivityDto.clientId === '') {
      updateActivityDto.clientId = null;
    }

    if (updateActivityDto.companyId === '') {
      updateActivityDto.companyId = null;
    }

    const { contactIds, ...dtoWithoutContacts } = updateActivityDto;

    const activityToUpdate = await this.activityRepository.preload({
      id,
      ...dtoWithoutContacts,
    });
    if (!activityToUpdate) {
      throw new NotFoundException(`Actividad con ID "${id}" no encontrada para actualizar.`);
    }

    if (contactIds !== undefined) {
      if (contactIds.length > 0) {
        activityToUpdate.contacts = await this.clientRepository.find({
          where: contactIds.map(id => ({ id }))
        });
      } else {
        activityToUpdate.contacts = [];
      }
    }

    const savedActivity = await this.activityRepository.save(activityToUpdate);

    // Registrar los cambios en el historial de la oportunidad
    const targetOpportunityId = savedActivity.opportunityId || originalActivity.opportunityId;
    const changes: string[] = [];
    if (targetOpportunityId) {
      if (updateActivityDto.activity !== undefined && updateActivityDto.activity !== originalActivity.activity) {
        changes.push(`- Descripción: "${originalActivity.activity}" -> "${updateActivityDto.activity}"`);
      }
      if (updateActivityDto.date !== undefined) {
        const origDateStr = originalActivity.date ? new Date(originalActivity.date).toLocaleString('es-MX') : 'N/A';
        const newDateStr = new Date(updateActivityDto.date).toLocaleString('es-MX');
        if (origDateStr !== newDateStr) {
          changes.push(`- Fecha: ${origDateStr} -> ${newDateStr}`);
        }
      }
      if (updateActivityDto.typeActivityId !== undefined && updateActivityDto.typeActivityId !== originalActivity.typeActivityId) {
        const oldType = originalActivity.typeActivityId ? await this.typeActivityRepository.findOne({ where: { id: originalActivity.typeActivityId } }) : null;
        const newType = updateActivityDto.typeActivityId ? await this.typeActivityRepository.findOne({ where: { id: updateActivityDto.typeActivityId } }) : null;
        changes.push(`- Tipo de actividad: "${oldType?.strname || 'N/A'}" -> "${newType?.strname || 'N/A'}"`);
      }

      if (changes.length > 0) {
        const fullUser = await this.usersService.findOneById(currentUserId);
        const username = fullUser?.username || 'Sistema';
        const typeAct = savedActivity.typeActivityId
          ? await this.typeActivityRepository.findOne({ where: { id: savedActivity.typeActivityId } })
          : null;
        const typeName = typeAct ? typeAct.strname : 'Actividad';
        
        const comment = `El usuario ${username} modificó la actividad de tipo "${typeName}":\n${changes.join('\n')}`;
        await this.interactionsService.create({
          opportunity_id: targetOpportunityId,
          comment,
        });
      }
    }

    // Gestionar recordatorio
    if (updateActivityDto.reminder) {
      await this.remindersService.upsertForActivity(savedActivity.id, updateActivityDto.reminder);
    } else if (updateActivityDto.reminder === null) {
      await this.remindersService.deleteByActivity(savedActivity.id);
    }

    const result = await this.activityRepository.findOne({
      where: { id: savedActivity.id },
      relations: ['user', 'opportunity', 'client', 'company', 'contacts'],
    });
    if (result) {
      (result as any).reminder = await this.remindersService.findByActivity(savedActivity.id);

      // Notificar al ejecutivo de la oportunidad si hay cambios
      if (changes.length > 0 && result.opportunity && result.opportunity.ejecutivo_id) {
        const fullUser = await this.usersService.findOneById(currentUserId);
        const username = fullUser?.username || 'Sistema';
        const typeAct = result.typeActivityId
          ? await this.typeActivityRepository.findOne({ where: { id: result.typeActivityId } })
          : null;
        const typeName = typeAct ? typeAct.strname : 'Actividad';

        const formattedChanges = changes.map(c => {
          let cleaned = c.replace(/^- /, '');
          const parts = cleaned.split(/\s*->\s*/);
          if (parts.length === 2) {
            const colonIndex = parts[0].indexOf(':');
            if (colonIndex !== -1) {
              const label = parts[0].substring(0, colonIndex).trim();
              const originalVal = parts[0].substring(colonIndex + 1).replace(/"/g, '').trim();
              const newVal = parts[1].replace(/"/g, '').trim();
              return `${label}: de <strong>${originalVal} -> ${newVal}</strong>.`;
            }
          }
          return cleaned;
        }).join('<br/>');

        const updateMessage = `El usuario <strong>${username}</strong> modificó una actividad de tipo <strong>${typeName}</strong> asociada a la oportunidad <strong>${result.opportunity.nombre_proyecto}</strong>.<br/><br/><strong>Cambio realizado:</strong><br/><br/>${formattedChanges}<br/><br/>Ingresa a la plataforma para consultar los detalles y dar seguimiento a la modificación de la actividad, si es necesario.`;

        await this.notificationsService.createAndSendNotification(
          result.opportunity.ejecutivo_id,
          'Actividad Modificada en Oportunidad',
          updateMessage,
          'activity_updated',
          result.opportunity.id,
        );
      }
    }
    return this.fillDeletedType(result!);
  }

  async remove(id: string, user: User): Promise<void> {
    const currentUserId = user.id || (user as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario para la eliminación.');
    }

    const [fullCurrentUser, activity] = await Promise.all([
      this.usersService.findOneById(currentUserId),
      this.activityRepository.findOne({
        where: { id },
        relations: ['opportunity', 'typeActivity'],
      }),
    ]);

    if (!activity) {
      throw new NotFoundException(`Actividad con ID "${id}" no encontrada.`);
    }

    /* if (fullCurrentUser.role !== Role.Admin && activity.userId !== currentUserId) {
       throw new ForbiddenException('No tienes permiso para eliminar esta actividad.');
     }*/

    // Notificar al ejecutivo de la oportunidad antes de eliminar
    if (activity.opportunity && activity.opportunity.ejecutivo_id) {
      const username = fullCurrentUser?.username || 'Sistema';
      const typeName = activity.typeActivity?.strname || 'Actividad';

      await this.notificationsService.createAndSendNotification(
        activity.opportunity.ejecutivo_id,
        'Actividad Eliminada de Oportunidad',
        `El usuario ${username} eliminó la actividad de tipo "${typeName}" de la oportunidad "${activity.opportunity.nombre_proyecto}".`,
        'activity_deleted',
        activity.opportunity.id,
      );
    }

    const result = await this.activityRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Actividad con ID "${id}" no encontrada.`);
    }
  }
}