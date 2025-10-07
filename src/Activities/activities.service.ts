import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'role.enum';
import { UsersService } from 'src/users/users.service';
import { Activity } from './entities/activity.entity';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger('ActivitiesService');

  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    private readonly usersService: UsersService,
  ) {}

  async create(
    createActivityDto: CreateActivityDto,
    user: User,
  ): Promise<Activity> {
    this.logger.log(`Attempting to create activity. User object received: ${JSON.stringify(user)}`);

    // El payload del token puede venir con 'id' o 'userId'. Validamos y usamos el que exista.
    const userId = user.id || (user as any).userId;

    if (!user || !userId) {
      this.logger.error('User object is invalid or missing an identifier (id or userId).', { user });
      throw new InternalServerErrorException(
        'No se pudo obtener la información del usuario para crear la actividad.',
      );
    }

    // Si opportunityId es un string vacío, lo convertimos a null
    // para que la base de datos lo acepte en la columna UUID nullable.
    if (createActivityDto.opportunityId === '') {
      createActivityDto.opportunityId = null;
    }

    const activity = this.activityRepository.create({
      ...createActivityDto,
      user: { id: userId } as User,
    });

    return await this.activityRepository.save(activity);
  }

  async findAll(
    currentUser: User,
    userId?: string,
    opportunityId?: string,
  ): Promise<Activity[]> {
    // El payload del token puede venir con 'id' o 'userId'. Obtenemos el ID correcto.
    const currentUserId = currentUser.id || (currentUser as any).userId;
    if (!currentUserId) {
      throw new InternalServerErrorException('No se pudo identificar al usuario actual.');
    }

    // Carga la entidad completa del usuario actual para asegurar que los roles son correctos.
    const fullCurrentUser = await this.usersService.findOneById(currentUserId);

    const options: FindManyOptions<Activity> = {
      where: {},
      relations: ['user', 'opportunity'],
      order: { date: 'DESC' },
    };

    // Construcción de la cláusula 'where' de forma segura y aditiva.
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
    return this.activityRepository.find(options);
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

    // Verificación de autorización con datos fiables
    if (fullCurrentUser.role !== Role.Admin && originalActivity.userId !== currentUserId) {
      throw new ForbiddenException('No tienes permiso para editar esta actividad.');
    }

    // Si opportunityId se envía como un string vacío, lo convertimos a null
    // para que la base de datos lo acepte.
    // Es importante verificar que la propiedad exista en el DTO.
    if (updateActivityDto.opportunityId === '') {
      updateActivityDto.opportunityId = null;
    }

    // Preload fusiona la entidad existente con los nuevos datos del DTO
    const activityToUpdate = await this.activityRepository.preload({
      id,
      ...updateActivityDto,
    });
 // Si preload devuelve undefined, es que no encontró el ID.
    if (!activityToUpdate) {
      throw new NotFoundException(`Actividad con ID "${id}" no encontrada para actualizar.`);
    }
    // Guardamos la entidad actualizada y la retornamos
    return this.activityRepository.save(activityToUpdate);
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