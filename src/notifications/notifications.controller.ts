import { Controller, Get, Logger } from '@nestjs/common';
import { NotificationsSchedulerService } from './notifications.scheduler.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger('NotificationsController');

  constructor(private readonly schedulerService: NotificationsSchedulerService) {}

  @Get('trigger-test')
  @ApiOperation({ summary: 'Dispara manualmente el envío de notificaciones diarias para el día de hoy' })
  async triggerTest() {
    this.logger.log('Disparando manualmente el envío de notificaciones diarias desde el controlador de pruebas');
    try {
      const result = await this.schedulerService.sendDailyNotifications();
      return {
        success: true,
        message: 'Ejecución manual de notificaciones diarias de hoy finalizada.',
        data: result,
      };
    } catch (error) {
      this.logger.error('Error durante la ejecución manual del envío:', error);
      return {
        success: false,
        message: 'Error al enviar notificaciones diarias.',
        error: error.message || error,
      };
    }
  }
}
