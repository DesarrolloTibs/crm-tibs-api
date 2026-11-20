import { Controller, Get, Patch, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { HelpdesksService } from './helpdesks.service';
import { UpdateHelpdeskCronConfigDto } from './dto/update-helpdesk-cron-config.dto';
import { UpdateMainHelpdeskDto } from './dto/update-main-helpdesk.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';

@ApiTags('helpdesks')
@ApiBearerAuth()
@Controller('helpdesks')
@UseGuards(AuthGuard('jwt'))
export class HelpdesksController {
  constructor(private readonly helpdesksService: HelpdesksService) {}

  private checkAdmin(user: User) {
    if (user.role !== Role.Admin && user.role !== Role.SuperAdmin && (user.role as any) !== 'superadmin') {
      throw new ForbiddenException('Solo los administradores pueden configurar la mesa de ayuda.');
    }
  }

  @Get('main')
  @ApiOperation({ summary: 'Obtener la mesa de ayuda principal con sus etapas' })
  getMainHelpdesk() {
    return this.helpdesksService.getMainHelpdesk();
  }

  @Get('main/stages/active')
  @ApiOperation({ summary: 'Obtener las etapas activas de la mesa de ayuda principal' })
  getActiveStages() {
    return this.helpdesksService.getActiveStages();
  }

  @Patch('main')
  @ApiOperation({ summary: 'Actualizar los datos y etapas de la mesa de ayuda principal' })
  updateMainHelpdesk(@Body() updateDto: UpdateMainHelpdeskDto, @GetUser() user: User) {
    this.checkAdmin(user);
    return this.helpdesksService.updateMainHelpdesk(updateDto);
  }

  @Get('cron-config')
  @ApiOperation({ summary: 'Obtener la configuración del cron de notificaciones de la Mesa de Ayuda' })
  getCronConfig() {
    return this.helpdesksService.getCronConfig();
  }

  @Patch('cron-config')
  @ApiOperation({ summary: 'Guardar la configuración del cron de notificaciones de la Mesa de Ayuda' })
  saveCronConfig(@Body() dto: UpdateHelpdeskCronConfigDto, @GetUser() user: User) {
    this.checkAdmin(user);
    return this.helpdesksService.saveCronConfig(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las mesas de ayuda con sus etapas' })
  findAll() {
    return this.helpdesksService.findAll();
  }
}
