import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Reminder } from '../reminders/entities/reminder.entity';
import { Activity } from '../Activities/entities/activity.entity';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class NotificationsSchedulerService {
  private readonly logger = new Logger('NotificationsSchedulerService');

  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepository: Repository<Reminder>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Tarea programada que se ejecuta todos los días a las 9:00 AM.
   * Utiliza la zona horaria definida en la configuración (por defecto America/Mexico_City).
   */
  @Cron('0 9 * * 1-5', {
    name: 'daily_notifications',
    timeZone: 'America/Mexico_City', // Zona horaria por defecto
  })
  async handleDailyNotificationsCron() {
    this.logger.log('Iniciando ejecución programada (cron) de notificaciones diarias a las 9:00 AM');
    try {
      await this.sendDailyNotifications();
      this.logger.log('Ejecución programada de notificaciones completada con éxito');
    } catch (error) {
      this.logger.error('Error durante la ejecución programada de notificaciones:', error);
    }
  }

  /**
   * Ejecuta el proceso de envío de notificaciones del día de hoy.
   * @returns Un resumen estadístico del envío para fines de depuración o control.
   */
  async sendDailyNotifications(): Promise<{ usersNotified: number; emailsSent: string[] }> {
    const timezone = this.configService.get<string>('NOTIFICATION_TIMEZONE') || 'America/Mexico_City';
    const now = new Date();
    
    // Obtener la fecha en formato YYYY-MM-DD en la zona horaria destino
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = formatter.format(now); // e.g. "2026-05-27"
    this.logger.log(`Calculando rango de fecha para el día: ${todayStr} (Zona Horaria: ${timezone})`);

    // Calcular el desfase horario para componer la fecha absoluta
    const offsetStr = this.getTimezoneOffsetString(timezone, now);
    
    const startOfDay = new Date(`${todayStr}T00:00:00.000${offsetStr}`);
    const endOfDay = new Date(`${todayStr}T23:59:59.999${offsetStr}`);
    
    this.logger.log(`Rango de búsqueda UTC: [${startOfDay.toISOString()}] a [${endOfDay.toISOString()}]`);

    // 1. Consultar recordatorios para el día de hoy
    const reminders = await this.reminderRepository.find({
      where: {
        date: Between(startOfDay, endOfDay),
      },
      relations: ['activity', 'activity.user'],
    });
    this.logger.log(`Encontrados ${reminders.length} recordatorios para hoy`);

    // 2. Consultar actividades para el día de hoy
    const activities = await this.activityRepository.find({
      where: {
        date: Between(startOfDay, endOfDay),
      },
      relations: ['user', 'opportunity', 'client'],
    });
    this.logger.log(`Encontradas ${activities.length} actividades para hoy`);

    // Mapa para agrupar recordatorios y actividades por usuario
    // Key: userId, Value: { user: User, reminders: Reminder[], activities: Activity[] }
    const userMap = new Map<string, { user: User; reminders: Reminder[]; activities: Activity[] }>();

    // Agrupar recordatorios por el usuario dueño de la actividad
    for (const reminder of reminders) {
      const usuario = reminder.activity?.user;
      if (!usuario) {
        this.logger.warn(`El recordatorio "${reminder.title}" (${reminder.id}) no tiene actividad o usuario asignado`);
        continue;
      }
      if (!usuario.isActive) {
        this.logger.debug(`Omitiendo recordatorio para el usuario inactivo: ${usuario.username}`);
        continue;
      }

      if (!userMap.has(usuario.id)) {
        userMap.set(usuario.id, { user: usuario, reminders: [], activities: [] });
      }
      const entry = userMap.get(usuario.id);
      if (entry) {
        entry.reminders.push(reminder);
      }
    }

    // Agrupar actividades
    for (const activity of activities) {
      const user = activity.user;
      if (!user) {
        this.logger.warn(`La actividad "${activity.activity}" (${activity.id}) no tiene usuario asignado`);
        continue;
      }
      if (!user.isActive) {
        this.logger.debug(`Omitiendo actividad para el usuario inactivo: ${user.username}`);
        continue;
      }

      if (!userMap.has(user.id)) {
        userMap.set(user.id, { user, reminders: [], activities: [] });
      }
      const entry = userMap.get(user.id);
      if (entry) {
        entry.activities.push(activity);
      }
    }

    const emailsSent: string[] = [];
    
    // 3. Enviar un único correo resumen por cada usuario
    for (const [userId, data] of userMap.entries()) {
      if (data.reminders.length === 0 && data.activities.length === 0) {
        continue;
      }

      this.logger.log(
        `Enviando resumen a ${data.user.username} (${data.user.email}) - Recordatorios: ${data.reminders.length}, Actividades: ${data.activities.length}`,
      );

      try {
        await this.mailService.sendDailySummary(
          data.user.email,
          data.user.username,
          data.reminders,
          data.activities,
        );
        emailsSent.push(data.user.email);
      } catch (error) {
        this.logger.error(`Error al enviar resumen diario a ${data.user.email}:`, error);
      }
    }

    return {
      usersNotified: emailsSent.length,
      emailsSent,
    };
  }

  /**
   * Obtiene la cadena de desfase de la zona horaria en formato [+-]HH:mm
   */
  private getTimezoneOffsetString(timeZone: string, date: Date): string {
    try {
      const tzString = date.toLocaleString('en-US', { timeZone, timeZoneName: 'longOffset' });
      // tzString contiene algo como "5/27/2026, 11:55:21 AM GMT-6" o "GMT+05:30"
      const match = tzString.match(/GMT([+-]\d+(?::\d+)?)/);
      if (match) {
        let offset = match[1];
        if (!offset.includes(':')) {
          const sign = offset[0] === '-' || offset[0] === '+' ? offset[0] : '+';
          const numStr = offset.replace(/[+-]/, '');
          const hours = parseInt(numStr, 10);
          offset = `${sign}${hours.toString().padStart(2, '0')}:00`;
        }
        return offset;
      }
    } catch (e) {
      this.logger.warn(`Fallo al calcular offset exacto para ${timeZone}, usando fallback -06:00:`, e);
    }
    return '-06:00'; // Fallback por defecto para la hora de México
  }
}
