/**
 * Constantes de eventos para el módulo de scheduler de notificaciones.
 * Usadas con EventEmitter2 para desacoplar dependencias circulares.
 */
export const SCHEDULER_EVENTS = {
  /** Emitido por HelpdesksService cuando se actualiza la configuración del cron de tickets no atendidos */
  RESCHEDULE_UNATTENDED_TICKETS: 'scheduler.reschedule_unattended_tickets',
} as const;
