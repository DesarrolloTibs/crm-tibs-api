import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ForbiddenException, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ReportsService } from './reports.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';
import { DashboardIndicator } from './entities/dashboard-indicator.entity';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @SkipThrottle()
  @Get('dashboard')
  @ApiOperation({ summary: 'Obtener datos consolidados para el dashboard de reportes' })
  getDashboardData(@GetUser() user: User) {
    return this.reportsService.getDashboardData(user);
  }

  @Get('indicators')
  @ApiOperation({ summary: 'Obtener la lista de todos los indicadores de dashboard configurados' })
  getIndicators() {
    return this.reportsService.findAllIndicators();
  }

  @Post('indicators')
  @ApiOperation({ summary: 'Crear un nuevo indicador de dashboard (solo Admin)' })
  createIndicator(@Body() body: any, @GetUser() user: User) {
    this.checkAdmin(user);
    return this.reportsService.createIndicator(body);
  }

  @Patch('indicators/:id')
  @ApiOperation({ summary: 'Actualizar un indicador de dashboard existente (solo Admin)' })
  updateIndicator(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.checkAdmin(user);
    return this.reportsService.updateIndicator(id, body);
  }

  @Delete('indicators/:id')
  @ApiOperation({ summary: 'Eliminar un indicador de dashboard (solo Admin)' })
  deleteIndicator(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
    this.checkAdmin(user);
    return this.reportsService.deleteIndicator(id);
  }

  private checkAdmin(user: User) {
    if (user.role !== Role.Admin && user.role !== Role.SuperAdmin && (user.role as any) !== 'superadmin') {
      throw new ForbiddenException('Solo los administradores pueden realizar esta operación.');
    }
  }

}
