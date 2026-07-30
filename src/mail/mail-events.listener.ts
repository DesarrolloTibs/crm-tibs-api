import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from './mail.service';
import {
  MAIL_EVENTS,
} from '../common/events/mail.events';
import type { SendResetPasswordPayload, SendSubscriptionAlertPayload } from '../common/events/mail.events';

/**
 * Listens for mail events emitted by other modules and dispatches them via MailService.
 * Decouples email sending from the HTTP request cycle — callers fire-and-forget.
 *
 * Current supported events:
 *   - mail.send.reset_password  → MailService.sendResetPasswordEmail
 *   - mail.send.subscription_alert → MailService.sendGeneralNotificationEmail
 */
@Injectable()
export class MailEventsListener {
  private readonly logger = new Logger('MailEventsListener');

  constructor(private readonly mailService: MailService) {}

  @OnEvent(MAIL_EVENTS.SEND_RESET_PASSWORD)
  async handleResetPasswordMail(payload: SendResetPasswordPayload): Promise<void> {
    try {
      this.logger.log(`Sending password-reset email to ${payload.to}`);
      await this.mailService.sendResetPasswordEmail(payload.to, payload.resetToken, payload.to);
    } catch (err: any) {
      this.logger.error(`Failed to send password-reset email to ${payload.to}: ${err.message}`);
    }
  }

  @OnEvent(MAIL_EVENTS.SEND_SUBSCRIPTION_ALERT)
  async handleSubscriptionAlertMail(payload: SendSubscriptionAlertPayload): Promise<void> {
    try {
      this.logger.log(`Sending subscription alert email to ${payload.to} for schema ${payload.schemaName}`);
      await this.mailService.sendGeneralNotificationEmail(
        payload.to,
        `Límite de suscripción alcanzado — ${payload.limitType}`,
        `<p>El tenant <strong>${payload.schemaName}</strong> ha alcanzado el límite de <strong>${payload.limitType}</strong>.</p><p>Uso actual: ${payload.currentUsage} / ${payload.maxAllowed}</p>`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to send subscription alert email: ${err.message}`);
    }
  }
}
