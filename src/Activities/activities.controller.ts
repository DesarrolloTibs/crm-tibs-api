import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CreateTypeActivityDto } from './dto/create-type-activity.dto';
import { UpdateTypeActivityDto } from './dto/update-type-activity.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Activity } from './entities/activity.entity';
import { User } from 'src/users/entities/user.entity';

@ApiTags('activities')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) { }


  @Get('types')
  async getTypes() {
    return this.activitiesService.findAllTypes();
  }

  @Post('types')
  @ApiOperation({ summary: 'Crear un nuevo tipo de actividad (solo Admin)' })
  @ApiBody({ type: CreateTypeActivityDto })
  async createType(@Body() createTypeActivityDto: CreateTypeActivityDto, @GetUser() user: User) {
    return this.activitiesService.createType(createTypeActivityDto, user);
  }

  @Patch('types/:id')
  @ApiOperation({ summary: 'Actualizar un tipo de actividad (solo Admin)' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del tipo de actividad' })
  @ApiBody({ type: UpdateTypeActivityDto })
  async updateType(
    @Param('id') id: string,
    @Body() updateTypeActivityDto: UpdateTypeActivityDto,
    @GetUser() user: User,
  ) {
    return this.activitiesService.updateType(Number(id), updateTypeActivityDto, user);
  }

  @Delete('types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un tipo de actividad (solo Admin)' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del tipo de actividad' })
  async removeType(@Param('id') id: string, @GetUser() user: User) {
    return this.activitiesService.removeType(Number(id), user);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una nueva actividad' })
  @ApiBody({ type: CreateActivityDto })
  @ApiResponse({
    status: 201,
    description: 'Actividad creada exitosamente.',
    type: Activity,
  })
  create(@Body() createActivityDto: CreateActivityDto, @GetUser() user: User) {
    return this.activitiesService.create(createActivityDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener todas las actividades con filtros opcionales',
  })
  @ApiQuery({ name: 'userId', required: false, description: 'Filtrar por ID de usuario (solo Admins)' })
  @ApiQuery({ name: 'opportunityId', required: false, description: 'Filtrar por ID de oportunidad' })
  @ApiResponse({ status: 200, description: 'Lista de actividades.', type: [Activity] })
  findAll(
    @GetUser() user: User,
    @Query('userId') userId?: string,
    @Query('opportunityId') opportunityId?: string,
  ) {
    return this.activitiesService.findAll(user, userId, opportunityId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una actividad' })
  @ApiParam({ name: 'id', type: String, description: 'ID de la actividad' })
  @ApiBody({ type: UpdateActivityDto })
  @ApiResponse({
    status: 200,
    description: 'Actividad actualizada exitosamente.',
    type: Activity,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateActivityDto: UpdateActivityDto,
    @GetUser() user: User,
  ) {
    return this.activitiesService.update(id, updateActivityDto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una actividad' })
  @ApiParam({ name: 'id', type: String, description: 'ID de la actividad' })
  @ApiResponse({
    status: 204,
    description: 'Actividad eliminada exitosamente.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.activitiesService.remove(id, user);
  }
}