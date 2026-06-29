import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { Reminder } from '../reminders/entities/reminder.entity';
import { Activity } from '../Activities/entities/activity.entity';
import { User } from '../users/entities/user.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { HelpdeskCronConfig } from '../tickets/entities/helpdesk-cron-config.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Notification } from './entities/notification.entity';
import { Role } from '../role.enum';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger('NotificationsSchedulerService');
  private readonly CRON_JOB_NAME = 'unattended_tickets_alert';

  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepository: Repository<Reminder>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(HelpdeskCronConfig)
    private readonly cronConfigRepository: Repository<HelpdeskCronConfig>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Al iniciar el módulo, programa el cron dinámico según la configuración
   * almacenada en la base de datos.
   */
  async onModuleInit() {
    await this.rescheduleUnattendedTicketsCron();
  }

  /**
   * Tarea programada que se ejecuta todos los días a las 9:00 AM.
   * Utiliza la zona horaria definida en la configuración (por defecto America/Mexico_City).
   */
  @Cron('0 9 * * 1-5', {
    name: 'daily_notifications',
    timeZone: 'America/Mexico_City',
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
   * Revisa oportunidades cuyo semáforo ha vencido (en rojo) y envía alertas solo al ejecutivo asignado.
   * Si la oportunidad no tiene ejecutivo asignado, no notifica a nadie.
   */
  async checkRedOpportunities(): Promise<void> {
    this.logger.log('Revisando oportunidades con semáforo vencido (en rojo)...');
    try {
      const opportunities = await this.opportunityRepository.find({
        where: { archived: false },
        relations: ['stage', 'ejecutivo'],
      });

      const now = new Date();
      for (const opp of opportunities) {
        if (!opp.stage || !opp.stage.intmaxdays || opp.stage.intmaxdays <= 0) continue;
        if (!opp.stage_entered_at || !opp.ejecutivo_id) continue; // Si no tiene ejecutivo asignado, no notifica a nadie

        const diffDays = Math.floor((now.getTime() - new Date(opp.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > opp.stage.intmaxdays) {
          await this.notificationsService.createAndSendNotification(
            opp.ejecutivo_id,
            '🚨 Semáforo Vencido (Oportunidad en Rojo)',
            `La oportunidad "${opp.nombre_proyecto}" ha permanecido ${diffDays} días en la etapa "${opp.stage.strname}" (Máximo permitido: ${opp.stage.intmaxdays} días).`,
            'opportunity_red',
            opp.id,
          );
        }
      }
    } catch (e) {
      this.logger.error('Error verificando oportunidades con semáforo vencido:', e);
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
    
    // 3. Enviar un único correo resumen por cada usuario y generar notificaciones in-app
    for (const [userId, data] of userMap.entries()) {
      if (data.reminders.length === 0 && data.activities.length === 0) {
        continue;
      }

      this.logger.log(
        `Enviando resumen a ${data.user.username} (${data.user.email}) - Recordatorios: ${data.reminders.length}, Actividades: ${data.activities.length}`,
      );

      // Notificaciones in-app para cada recordatorio del día
      for (const rem of data.reminders) {
        await this.notificationsService.createAndSendNotification(
          userId,
          '🔔 Recordatorio del Día',
          `Tienes un recordatorio hoy: "${rem.title}".`,
          'activity_reminder',
          rem.id,
          false, // El correo se envía agrupado en el resumen diario
        );
      }

      // Notificaciones in-app para cada actividad del día
      for (const act of data.activities) {
        await this.notificationsService.createAndSendNotification(
          userId,
          '📋 Actividad Programada para Hoy',
          `Tienes la actividad: "${act.activity}".`,
          'activity_reminder',
          act.id,
          false, // El correo se envía agrupado en el resumen diario
        );
      }

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

  // -----------------------------------------------------------------------
  // CRON DINÁMICO: Tickets desatendidos
  // -----------------------------------------------------------------------

  /**
   * Lee la configuración guardada en BD y (re)programa el cron job dinámico.
   * Llamado al iniciar el módulo y cada vez que el administrador guarda
   * una nueva configuración desde el panel.
   */
  async rescheduleUnattendedTicketsCron(): Promise<void> {
    const timeZone = 'America/Mexico_City';

    // Leer config de la BD
    let config: HelpdeskCronConfig | null = null;
    try {
      config = await this.cronConfigRepository.findOne({ where: {} });
    } catch (e) {
      this.logger.warn('No se pudo leer helpdesk_cron_config. Usando valor por defecto (09:00 diario).');
    }

    // Calcular la expresión cron
    let cronExpression: string;
    if (!config || config.cron_mode === 'fixed') {
      const time = config?.cron_time ?? '09:00';
      const [hour, minute] = time.split(':').map(Number);
      cronExpression = `${minute ?? 0} ${hour ?? 9} * * *`;
      this.logger.log(`Cron de tickets desatendidos: FIJO a las ${time} (${cronExpression})`);
    } else {
      // Modo intervalo: convertir a expresión cron
      const hours = config.cron_interval_hours ?? 0;
      const minutes = config.cron_interval_minutes ?? 0;

      if (hours === 0 && minutes > 0) {
        cronExpression = `*/${minutes} * * * *`;
      } else if (hours > 0 && minutes === 0) {
        cronExpression = `0 */${hours} * * *`;
      } else if (hours > 0 && minutes > 0) {
        // Intervalo mixto: ejecutar cada (hours*60 + minutes) minutos
        const totalMinutes = hours * 60 + minutes;
        cronExpression = `*/${totalMinutes} * * * *`;
      } else {
        // Fallback
        cronExpression = `0 9 * * *`;
      }
      this.logger.log(`Cron de tickets desatendidos: INTERVALO cada ${hours}h ${minutes}min (${cronExpression})`);
    }

    // Eliminar el job anterior si existe
    try {
      this.schedulerRegistry.deleteCronJob(this.CRON_JOB_NAME);
      this.logger.log(`Cron job '${this.CRON_JOB_NAME}' anterior eliminado.`);
    } catch {
      // No existía, es la primera vez
    }

    // Crear y registrar el nuevo job
    const job = new CronJob(
      cronExpression,
      async () => {
        this.logger.log('Iniciando verificación de tickets desatendidos y semáforos vencidos (cron dinámico)...');
        try {
          await this.checkUnattendedTickets();
        } catch (error) {
          this.logger.error('Error durante la verificación de tickets desatendidos:', error);
        }
        try {
          await this.checkRedOpportunities();
        } catch (error) {
          this.logger.error('Error durante la verificación de semáforos vencidos:', error);
        }
      },
      null,
      true,
      timeZone,
    );

    this.schedulerRegistry.addCronJob(this.CRON_JOB_NAME, job);
    this.logger.log(`Cron job '${this.CRON_JOB_NAME}' registrado correctamente.`);
  }

  /**
   * Revisa tickets en etapa inicial sin responsable asignado que lleven más de X horas sin atender.
   */
  async checkUnattendedTickets(): Promise<void> {
    const hoursLimit = this.configService.get<number>('TICKET_UNATTENDED_HOURS') || 24;
    const limitDate = new Date(Date.now() - hoursLimit * 60 * 60 * 1000);

    const unattendedTickets = await this.ticketRepository.createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.stage', 'stage')
      .where('ticket.responsable_id IS NULL')
      .andWhere('ticket.fecha_apertura <= :limitDate', { limitDate })
      .andWhere('stage.blninitial = :blnInitial', { blnInitial: true })
      .getMany();

    if (unattendedTickets.length === 0) {
      return;
    }

    this.logger.log(`Encontrados ${unattendedTickets.length} tickets desatendidos.`);

    // Obtener los administradores activos a notificar
    const admins = await this.userRepository.find({
      where: { role: Role.Admin, isActive: true }
    });

    if (admins.length === 0) {
      this.logger.warn('No hay administradores activos para notificar sobre los tickets desatendidos.');
      return;
    }

    for (const ticket of unattendedTickets) {
      const ticketNumStr = ticket.ticket_number.toString().padStart(5, '0');
      
      const diffMs = Date.now() - new Date(ticket.fecha_apertura).getTime();
      const elapsedHours = Math.floor(diffMs / (1000 * 60 * 60));
      let elapsedTime = '';
      if (elapsedHours < 1) {
        const elapsedMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
        elapsedTime = `${elapsedMinutes} minutos`;
      } else if (elapsedHours < 24) {
        elapsedTime = `${elapsedHours} ${elapsedHours === 1 ? 'hora' : 'horas'}`;
      } else {
        const days = Math.floor(elapsedHours / 24);
        const remainingHours = elapsedHours % 24;
        elapsedTime = remainingHours > 0 
          ? `${days} ${days === 1 ? 'día' : 'días'} y ${remainingHours} ${remainingHours === 1 ? 'hora' : 'horas'}` 
          : `${days} ${days === 1 ? 'día' : 'días'}`;
      }

      for (const admin of admins) {
        try {
          await this.mailService.sendTicketUnattendedAlert(
            admin.email,
            ticketNumStr,
            ticket.strtitle,
            elapsedTime
          );
        } catch (mailError) {
          this.logger.error(`Error al enviar correo de alerta al admin ${admin.email} para ticket #${ticketNumStr}:`, mailError);
        }
      }

      // Marcar alerta enviada
      ticket.alert_sent = true;
      await this.ticketRepository.save(ticket);
    }
  }
}
