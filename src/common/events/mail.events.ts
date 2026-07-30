/**
 * Event name constants for asynchronous mail operations.
 * Using EventEmitter2 allows services to fire-and-forget email dispatch
 * without blocking the HTTP response cycle.
 */
export const MAIL_EVENTS = {
  /** Send a generic plain-text / HTML email */
  SEND: 'mail.send',
  /** Send a welcome email to a new user */
  SEND_WELCOME: 'mail.send.welcome',
  /** Send a password-reset link */
  SEND_RESET_PASSWORD: 'mail.send.reset_password',
  /** Send a subscription-limit-reached alert to the tenant admin */
  SEND_SUBSCRIPTION_ALERT: 'mail.send.subscription_alert',
} as const;

export type MailEventName = (typeof MAIL_EVENTS)[keyof typeof MAIL_EVENTS];

/** Payload for MAIL_EVENTS.SEND */
export interface SendMailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Payload for MAIL_EVENTS.SEND_WELCOME */
export interface SendWelcomeMailPayload {
  to: string;
  username: string;
  loginUrl?: string;
}

/** Payload for MAIL_EVENTS.SEND_RESET_PASSWORD */
export interface SendResetPasswordPayload {
  to: string;
  resetToken: string;
  resetUrl: string;
}

/** Payload for MAIL_EVENTS.SEND_SUBSCRIPTION_ALERT */
export interface SendSubscriptionAlertPayload {
  to: string;
  schemaName: string;
  limitType: string;
  currentUsage: number;
  maxAllowed: number;
}
