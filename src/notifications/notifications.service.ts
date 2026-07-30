import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsGateway } from './notifications.gateway';
import { MailService } from '../mail/mail.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { NOTIFICATION_EVENTS, NotificationPayload } from '../common/events/notification.events';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  private async ensureTableExists() {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    try {
      await this.notificationRepository.query(`
        CREATE TABLE IF NOT EXISTS "${tenantSchema}".notifications (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL,
          title varchar(255) NOT NULL,
          message text NOT NULL,
          type varchar(50) NOT NULL,
          related_id varchar(255) NULL,
          read boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_notifications PRIMARY KEY (id)
        );

        ALTER TABLE "${tenantSchema}".notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
      `);
    } catch (e) {}
  }

  /**
   * Crea una notificación in-app, la emite vía WebSocket en tiempo real y opcionalmente envía correo.
   * Si userId no existe (la oportunidad no tiene ejecutivo asignado), no hace nada.
   */
  async createAndSendNotification(
    userId: string | null | undefined,
    title: string,
    message: string,
    type: string,
    relatedId?: string,
    sendEmail: boolean = true,
  ): Promise<Notification | null> {
    if (!userId) {
      this.logger.debug(`Omitiendo notificación "${title}": No hay ejecutivo asignado.`);
      return null;
    }

    await this.ensureTableExists();

    // Quitar tags HTML para la notificación en base de datos e in-app
    const plainMessage = message
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+(>|$)/g, '');

    const notification = this.notificationRepository.create({
      userId,
      title,
      message: plainMessage,
      type,
      relatedId: relatedId || null,
      read: false,
    });

    const saved = await this.notificationRepository.save(notification);
    this.logger.log(`Notificación creada [${type}] para ejecutivo ${userId}: "${title}"`);

    // Emisión vía WebSocket al ejecutivo asignado
    try {
      this.notificationsGateway.emitNotificationToUser(userId, saved);
    } catch (wsError) {
      this.logger.error(`Error emitiendo websocket para ejecutivo ${userId}:`, wsError);
    }

    // Envío por correo al ejecutivo asignado o SuperAdmin
    if (sendEmail) {
      try {
        let user = await this.userRepository.findOne({ where: { id: userId } }).catch(() => null);
        if (!user) {
          try {
            const pubUsers = await this.notificationRepository.manager.query(
              `SELECT id, username, email, "isActive" FROM public.users WHERE id::text = $1 OR LOWER(username) = LOWER($1)`,
              [userId]
            );
            if (pubUsers && pubUsers.length > 0) user = pubUsers[0] as User;
          } catch (e) {}
        }

        if (user && user.email && (user.isActive ?? true)) {
          const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
          let actionUrl: string | undefined = undefined;

          if (saved.relatedId && saved.type) {
            if (saved.type.includes('opportunity') || saved.type.includes('activity') || saved.type.includes('semaphore')) {
              actionUrl = `${frontendUrl}/pipeline?opportunityId=${saved.relatedId}`;
            } else if (saved.type.includes('ticket')) {
              actionUrl = `${frontendUrl}/helpdesk?ticketId=${saved.relatedId}`;
            }
          }

          await this.mailService.sendGeneralNotificationEmail(
            user.email,
            title,
            message,
            actionUrl,
            saved.type,
            user.username,
          );
        }
      } catch (mailError) {
        this.logger.error(`Error enviando correo de notificación a ejecutivo ${userId}:`, mailError);
      }
    }

    return saved;
  }

  /**
   * Listener de evento desacoplado.
   * Permite que otros módulos (ej. ConversationsService) emitan notificaciones
   * sin importar directamente NotificationsService (elimina dependencia circular).
   */
  @OnEvent(NOTIFICATION_EVENTS.CREATE_AND_SEND)
  async handleCreateAndSendNotification(payload: NotificationPayload & {
    title: string;
    sendEmail?: boolean;
  }): Promise<void> {
    try {
      await this.createAndSendNotification(
        payload.userId,
        payload.title,
        payload.message,
        payload.type,
        payload.entityId,
        payload.sendEmail ?? true,
      );
    } catch (err) {
      this.logger.error(`Error procesando evento ${NOTIFICATION_EVENTS.CREATE_AND_SEND}:`, err);
    }
  }

  async getUserNotifications(userId: string, limit: number = 30): Promise<Notification[]> {
    await this.ensureTableExists();

    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const isSuper = await this.notificationRepository.manager.query(
      `SELECT id, username FROM public.users WHERE (id::text = $1 OR LOWER(username) = LOWER($1)) AND LOWER(role::text) = 'superadmin'`,
      [userId]
    ).catch(() => []);

    const isSuperAdminUser = isSuper && isSuper.length > 0;

    // Regla de Negocio: Si es SuperUsuario interactuando en un tenant diferente de public, el ícono de notificaciones no opera
    if (isSuperAdminUser && tenantSchema !== 'public') {
      return [];
    }

    const username = isSuper.length > 0 ? isSuper[0].username : userId;

    const rows = await this.notificationRepository.manager.query(
      `SELECT id, user_id AS "userId", title, message, type, related_id AS "relatedId", read, created_at AS "createdAt"
       FROM "${tenantSchema}".notifications
       WHERE user_id::text = $1 OR LOWER(user_id::text) = LOWER($2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, username, limit]
    ).catch(() => []);

    return rows as Notification[];
  }

  /**
   * Marca una notificación como leída.
   */
  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    await this.ensureTableExists();

    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const isSuper = await this.notificationRepository.manager.query(
      `SELECT id, username FROM public.users WHERE (id::text = $1 OR LOWER(username) = LOWER($1)) AND LOWER(role::text) = 'superadmin'`,
      [userId]
    ).catch(() => []);

    if (isSuper && isSuper.length > 0 && tenantSchema !== 'public') {
      return null;
    }

    const username = isSuper.length > 0 ? isSuper[0].username : userId;

    await this.notificationRepository.manager.query(
      `UPDATE "${tenantSchema}".notifications SET read = true WHERE id::text = $1 AND (user_id::text = $2 OR LOWER(user_id::text) = LOWER($3))`,
      [id, userId, username]
    ).catch(() => null);

    const notification = await this.notificationRepository.findOne({ where: { id } }).catch(() => null);
    return notification;
  }

  /**
   * Marca todas las notificaciones de un usuario como leídas.
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.ensureTableExists();

    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const isSuper = await this.notificationRepository.manager.query(
      `SELECT id, username FROM public.users WHERE (id::text = $1 OR LOWER(username) = LOWER($1)) AND LOWER(role::text) = 'superadmin'`,
      [userId]
    ).catch(() => []);

    if (isSuper && isSuper.length > 0 && tenantSchema !== 'public') {
      return;
    }

    const username = isSuper.length > 0 ? isSuper[0].username : userId;

    await this.notificationRepository.manager.query(
      `UPDATE "${tenantSchema}".notifications SET read = true WHERE (user_id::text = $1 OR LOWER(user_id::text) = LOWER($2)) AND read = false`,
      [userId, username]
    ).catch(() => null);
  }
}




