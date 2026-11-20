import { Controller, Get, Patch, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PipelinesService } from './pipelines.service';
import { UpdateMainPipelineDto } from './dto/update-main-pipeline.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';

@ApiTags('pipelines')
@ApiBearerAuth()
@Controller('pipelines')
@UseGuards(AuthGuard('jwt'))
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Get('main')
  @ApiOperation({ summary: 'Obtener el pipeline principal con sus etapas' })
  getMainPipeline() {
    return this.pipelinesService.getMainPipeline();
  }

  @Get('main/stages/active')
  @ApiOperation({ summary: 'Obtener las etapas activas del pipeline principal' })
  getActiveStages() {
    return this.pipelinesService.getActiveStagesOfMainPipeline();
  }

  @Patch('main')
  @ApiOperation({ summary: 'Actualizar configuración del pipeline principal y sus etapas' })
  updateMainPipeline(@Body() updateDto: UpdateMainPipelineDto, @GetUser() user: User) {
    if (user.role !== Role.Admin && user.role !== Role.SuperAdmin && (user.role as any) !== 'superadmin') {
      throw new ForbiddenException('Solo los administradores pueden configurar el pipeline.');
    }
    return this.pipelinesService.updateMainPipeline(updateDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los pipelines con sus etapas' })
  findAll() {
    return this.pipelinesService.findAll();
  }
}
