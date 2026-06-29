import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsGateway } from './notifications.gateway';
import { MailService } from '../mail/mail.service';

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

    const notification = this.notificationRepository.create({
      userId,
      title,
      message,
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

    // Envío por correo al ejecutivo asignado
    if (sendEmail) {
      try {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (user && user.email && user.isActive) {
          const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
          let actionUrl: string | undefined = undefined;

          if (saved.relatedId && saved.type && saved.type.includes('opportunity')) {
            actionUrl = `${frontendUrl}/pipeline?opportunityId=${saved.relatedId}`;
          }

          await this.mailService.sendGeneralNotificationEmail(user.email, title, message, actionUrl);
        }
      } catch (mailError) {
        this.logger.error(`Error enviando correo de notificación a ejecutivo ${userId}:`, mailError);
      }
    }

    return saved;
  }

  /**
   * Obtiene las notificaciones recientes del usuario.
   */
  async getUserNotifications(userId: string, limit: number = 30): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Marca una notificación como leída.
   */
  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const notification = await this.notificationRepository.findOne({ where: { id, userId } });
    if (notification) {
      notification.read = true;
      return this.notificationRepository.save(notification);
    }
    return null;
  }

  /**
   * Marca todas las notificaciones de un usuario como leídas.
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update({ userId, read: false }, { read: true });
  }
}
