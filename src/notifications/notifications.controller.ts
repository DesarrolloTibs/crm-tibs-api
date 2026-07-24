import { Controller, Get, Patch, Param, ParseUUIDPipe, UseGuards, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsSchedulerService } from './notifications.scheduler.service';
import { NotificationsService } from './notifications.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger('NotificationsController');

  constructor(
    private readonly schedulerService: NotificationsSchedulerService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Obtener las notificaciones del usuario autenticado' })
  async getMyNotifications(@GetUser() user: User) {
    const userId = user?.id || (user as any)?.userId;
    return this.notificationsService.getUserNotifications(userId);
  }

  @Patch('read-all')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Marcar todas las notificaciones del usuario como leídas' })
  async markAllAsRead(@GetUser() user: User) {
    const userId = user?.id || (user as any)?.userId;
    await this.notificationsService.markAllAsRead(userId);
    return { success: true, message: 'Todas las notificaciones han sido marcadas como leídas.' };
  }

  @Patch(':id/read')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Marcar una notificación específica como leída' })
  async markAsRead(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    const userId = user?.id || (user as any)?.userId;
    const notification = await this.notificationsService.markAsRead(id, userId);
    return { success: true, data: notification };
  }


  @Get('trigger-test')
  @ApiOperation({ summary: 'Dispara manualmente el envío de notificaciones diarias y verificación de semáforos vencidos para pruebas' })
  async triggerTest() {
    this.logger.log('Disparando manualmente la prueba del cron de notificaciones');
    try {
      await this.schedulerService.handleDailyNotificationsCron();
      return {
        success: true,
        message: 'Ejecución manual de prueba del cron finalizada exitosamente.',
      };
    } catch (error) {
      this.logger.error('Error durante la ejecución manual del envío:', error);
      return {
        success: false,
        message: 'Error al ejecutar prueba del cron.',
        error: error.message || error,
      };
    }
  }
}
