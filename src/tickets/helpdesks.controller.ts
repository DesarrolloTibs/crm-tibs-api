import { Controller, Get, Patch, Body, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { HelpdesksService } from './helpdesks.service';
import { UpdateHelpdeskCronConfigDto } from './dto/update-helpdesk-cron-config.dto';

@ApiTags('helpdesks')
@ApiBearerAuth()
@Controller('helpdesks')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class HelpdesksController {
  constructor(private readonly helpdesksService: HelpdesksService) {}

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
  updateMainHelpdesk(@Body() updateDto: any) {
    return this.helpdesksService.updateMainHelpdesk(updateDto);
  }

  @Get('cron-config')
  @ApiOperation({ summary: 'Obtener la configuración del cron de notificaciones de la Mesa de Ayuda' })
  getCronConfig() {
    return this.helpdesksService.getCronConfig();
  }

  @Patch('cron-config')
  @ApiOperation({ summary: 'Guardar la configuración del cron de notificaciones de la Mesa de Ayuda' })
  saveCronConfig(@Body() dto: UpdateHelpdeskCronConfigDto) {
    return this.helpdesksService.saveCronConfig(dto);
  }
}
