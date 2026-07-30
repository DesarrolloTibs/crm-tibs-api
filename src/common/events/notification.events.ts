/**
 * Constantes de eventos para el módulo de notificaciones.
 * Usadas con EventEmitter2 para desacoplar dependencias circulares.
 */
export const NOTIFICATION_EVENTS = {
  /** Emitido cuando un servicio necesita crear y enviar una notificación a un usuario */
  CREATE_AND_SEND: 'notification.create_and_send',
} as const;

export interface NotificationPayload {
  userId: string;
  type: string;
  message: string;
  link?: string;
  entityId?: string;
  entityType?: string;
}
