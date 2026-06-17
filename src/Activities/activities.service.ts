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

  async createType(
    createTypeActivityDto: CreateTypeActivityDto,
    user: User,
  ): Promise<TypeActivity> {
    const currentUserId = user.id || (user as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario.');
    }
    const fullCurrentUser = await this.usersService.findOneById(currentUserId);
    if (fullCurrentUser.role !== Role.Admin) {
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
    if (fullCurrentUser.role !== Role.Admin) {
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
    if (fullCurrentUser.role !== Role.Admin) {
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

    if (
      savedActivity.flaghistory &&
      savedActivity.opportunityId &&
      savedActivity.activity
    ) {
      await this.interactionsService.create({
        opportunity_id: savedActivity.opportunityId,
        comment: savedActivity.activity,
      });
    }
    const result = await this.activityRepository.findOne({
      where: { id: savedActivity.id },
      relations: ['user', 'opportunity', 'client', 'company', 'contacts'],
    });
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

    const fullCurrentUser = await this.usersService.findOneById(currentUserId);

    const options: FindManyOptions<Activity> = {
      where: {},
      relations: ['user', 'opportunity', 'client', 'company', 'contacts'],
      order: { date: 'DESC' },
    };

    let whereClause: any = {};

    if (fullCurrentUser.role !== Role.Admin) {
      whereClause.userId = fullCurrentUser.id;
    } else if (userId) {
      whereClause.userId = userId;
    }

    if (opportunityId) {
      whereClause.opportunityId = opportunityId;
    }
    options.where = whereClause;
    const activities = await this.activityRepository.find(options);
    return activities.map(act => this.fillDeletedType(act));
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

    if (
      savedActivity.flaghistory &&
      savedActivity.opportunityId &&
      savedActivity.activity
    ) {
      await this.interactionsService.create({
        opportunity_id: savedActivity.opportunityId,
        comment: savedActivity.activity,
      });
    }
    const result = await this.activityRepository.findOne({
      where: { id: savedActivity.id },
      relations: ['user', 'opportunity', 'client', 'company', 'contacts'],
    });
    return this.fillDeletedType(result!);
  }

  async remove(id: string, user: User): Promise<void> {
    const currentUserId = user.id || (user as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario para la eliminación.');
    }

    const [fullCurrentUser, activity] = await Promise.all([
      this.usersService.findOneById(currentUserId),
      this.activityRepository.findOne({ where: { id } }),
    ]);

    if (!activity) {
      throw new NotFoundException(`Actividad con ID "${id}" no encontrada.`);
    }

    /* if (fullCurrentUser.role !== Role.Admin && activity.userId !== currentUserId) {
       throw new ForbiddenException('No tienes permiso para eliminar esta actividad.');
     }*/
    const result = await this.activityRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Actividad con ID "${id}" no encontrada.`);
    }
  }
}