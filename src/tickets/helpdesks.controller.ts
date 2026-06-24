import { Controller, Get, Patch, Body, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { HelpdesksService } from './helpdesks.service';

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
    // Para simplificar, aceptamos un objeto plano en el body
    return this.helpdesksService.updateMainHelpdesk(updateDto);
  }
}
