import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { join } from 'path';

@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = this.configService.get<number>('SMTP_PORT') || 587;
    const secure = this.configService.get<string>('SMTP_SECURE') === 'true';
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false, // Evita fallos de certificado SSL autofirmado
      },
    });
  }

  private getApiUrl(): string {
    let apiUrl = this.configService.get<string>('API_URL') || 'http://localhost:3091';
    if (apiUrl.endsWith('/')) {
      apiUrl = apiUrl.slice(0, -1);
    }
    return apiUrl;
  }

  /**
   * Envía el resumen diario de actividades y recordatorios a un usuario.
   */
  async sendDailySummary(
    to: string,
    username: string,
    reminders: any[],
    activities: any[],
  ): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM') || '"Billy Sales & Services" <noreply@tibs.com.mx>';
    const todayStr = new Date().toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    const htmlContent = this.generateHtmlTemplate(username, todayStr, reminders, activities, frontendUrl);

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `Resumen Diario de Actividades y Recordatorios - ${todayStr}`,
        html: htmlContent,
      });
      this.logger.log(`Resumen diario enviado con éxito a ${to}`);
    } catch (error) {
      this.logger.error(`Error al enviar correo de resumen diario a ${to}:`, error);
      throw error;
    }
  }

  /**
   * Envía un correo con el enlace para restablecer la contraseña.
   */
  async sendResetPasswordEmail(email: string, token: string, username: string): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM') || '"Billy Sales & Services" <noreply@tibs.com.mx>';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const apiUrl = this.getApiUrl();
    const formattedUsername = username ? username.charAt(0).toUpperCase() + username.slice(1) : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Restablecer Contraseña - Billy Sales & Services</title>
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
        </style>
      </head>
      <body style="background-color: #f8fafc; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 0; margin: 0; width: 100%;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="550" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; margin: 0 auto;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/header_restore_password.png" alt="Header" style="width: 100%; max-width: 550px; display: block; border-top-left-radius: 16px; border-top-right-radius: 16px;" />
            </td>
          </tr>
          <!-- CONTENT -->
          <tr>
            <td style="padding: 40px 30px; text-align: left;">
              <p style="color: #000000; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 700; margin: 0 0 20px 0;">
                Hola ${formattedUsername},
              </p>
              <p style="color: #334155; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; margin: 0 0 24px 0; line-height: 1.6;">
                Hemos recibido una solicitud para restablecer tu contraseña en la aplicación <strong>Billy Sales & Services</strong>, para continuar con el proceso da clic en el siguiente botón.
              </p>

              <!-- CTA BUTTON -->
              <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-top: 10px; margin-bottom: 24px; width: 100%;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" style="background-color: #054c04; border-radius: 24px;">
                      <tr>
                        <td align="center" style="padding: 12px 32px;">
                          <a href="${resetUrl}" target="_blank" style="font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: #00e600; text-decoration: none; display: inline-block;">Restablecer contraseña</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color: #334155; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; margin: 24px 0 8px 0; line-height: 1.6;">
                Si no puedes dar click en el boton copia y pega el siguiente link en tu navegador:
              </p>
              <p style="margin: 0 0 24px 0; word-break: break-all;">
                <a href="${resetUrl}" target="_blank" style="color: #054c04; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 700; text-decoration: underline; font-size: 14px;">${resetUrl}</a>
              </p>

              <p style="color: #334155; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; margin: 0; line-height: 1.6;">
                Si tu no hiciste la solicitud, puedes ignorar este correo. Si tienes dudas relacionadas con la solicitud puedes responder este correo para recibir ayuda personalizada.
              </p>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/footer.png" alt="Footer" style="width: 100%; max-width: 550px; display: block; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;" />
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject: 'Restablecer Contraseña - Billy Sales & Services',
        html: htmlContent,
      });
      this.logger.log(`Enlace de restablecimiento enviado con éxito a ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar correo de restablecimiento a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Genera el diseño HTML premium para el correo electrónico.
   */
  private generateHtmlTemplate(
    username: string,
    dateStr: string,
    reminders: any[],
    activities: any[],
    frontendUrl: string,
  ): string {
    // Renderizado de Recordatorios
    let remindersHtml = '';
    if (reminders.length === 0) {
      remindersHtml = `
        <div style="padding: 20px; text-align: center; color: #64748b; background-color: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
          <p style="margin: 0; font-size: 14px;">No tienes recordatorios programados para hoy.</p>
        </div>
      `;
    } else {
      remindersHtml = reminders
        .map((r) => {
          const timeStr = new Date(r.date).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          return `
            <div style="background-color: #ffffff; border-radius: 12px; padding: 18px; margin-bottom: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <span style="background-color: #ecfdf5; color: #047857; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Recordatorio</span>
                <span style="font-size: 12px; font-weight: 600; color: #475569; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">🕒 ${timeStr}</span>
              </div>
              <h4 style="margin: 0 0 6px 0; color: #1e293b; font-size: 15px; font-weight: 600;">${r.title}</h4>
              <p style="margin: 0; font-size: 13px; color: #64748b;">
                <strong>Oportunidad:</strong> ${r.opportunity?.nombre_proyecto || 'N/A'}<br/>
                <strong>Cliente:</strong> ${r.opportunity?.cliente?.nombre || r.opportunity?.empresa || 'N/A'}
              </p>
            </div>
          `;
        })
        .join('');
    }

    // Renderizado de Actividades
    let activitiesHtml = '';
    if (activities.length === 0) {
      activitiesHtml = `
        <div style="padding: 20px; text-align: center; color: #64748b; background-color: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
          <p style="margin: 0; font-size: 14px;">No tienes actividades programadas para hoy.</p>
        </div>
      `;
    } else {
      activitiesHtml = activities
        .map((a) => {
          const timeStr = new Date(a.date).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          const typeBadgeColor = this.getActivityTypeBadgeColor(a.activityType);
          return `
            <div style="background-color: #ffffff; border-radius: 12px; padding: 18px; margin-bottom: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <span style="background-color: ${typeBadgeColor.bg}; color: ${typeBadgeColor.fg}; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">${a.activityType || 'Actividad'}</span>
                <span style="font-size: 12px; font-weight: 600; color: #475569; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">🕒 ${timeStr}</span>
              </div>
              <p style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px; font-weight: 500; line-height: 1.4;">${a.activity}</p>
              <div style="border-top: 1px solid #f1f5f9; padding-top: 8px; font-size: 12px; color: #64748b;">
                <strong>Oportunidad:</strong> ${a.opportunity?.nombre_proyecto || 'Ninguna'}<br/>
                <strong>Cliente:</strong> ${a.client?.nombre || 'Ninguno'}
              </div>
            </div>
          `;
        })
        .join('');
    }

    const apiUrl = this.getApiUrl();
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resumen Diario Billy Sales & Services</title>
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
          table {
            border-collapse: collapse;
          }
        </style>
      </head>
      <body style="background-color: #f8fafc; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px 0; margin: 0; width: 100%;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; margin: 0 auto;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/header_reminder_activity.png" alt="Header" style="width: 100%; max-width: 600px; display: block; border-top-left-radius: 16px; border-top-right-radius: 16px;" />
            </td>
          </tr>
          <!-- CONTENT -->
          <tr>
            <td style="padding: 30px 30px;">
              <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 20px; font-weight: 700;">Tu Agenda del Día</h2>
              <p style="color: #64748b; font-size: 13px; margin: -10px 0 24px 0; font-weight: 500;">${dateStr}</p>
              
              <p style="color: #334155; font-size: 16px; margin: 0 0 24px 0; line-height: 1.6;">
                Hola <strong style="color: #2563eb;">${username}</strong>,
              </p>
              <p style="color: #64748b; font-size: 14px; margin: 0 0 28px 0; line-height: 1.6;">
                A continuación se muestra el listado de los recordatorios y las actividades bajo tu responsabilidad programados para el día de hoy. ¡Que tengas un excelente día de trabajo!
              </p>

              <!-- RECORDATORIOS SECTION -->
              <div style="margin-bottom: 32px;">
                <h3 style="color: #2563eb; border-bottom: 2px solid #ecfdf5; padding-bottom: 8px; margin: 0 0 16px 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;">
                  <span style="margin-right: 8px;">🔔</span> Recordatorios de Oportunidades
                </h3>
                ${remindersHtml}
              </div>

              <!-- ACTIVIDADES SECTION -->
              <div style="margin-bottom: 24px;">
                <h3 style="color: #2563eb; border-bottom: 2px solid #eff6ff; padding-bottom: 8px; margin: 0 0 16px 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;">
                  <span style="margin-right: 8px;">📋</span> Actividades Programadas
                </h3>
                ${activitiesHtml}
              </div>
              
              <!-- CTA BUTTON -->
              <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-top: 32px; margin-bottom: 16px; text-align: center; margin: 32px auto 16px auto;">
                <tr>
                  <td align="center" style="background-color: #2563eb; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                    <a href="${frontendUrl}/login" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">Acceder a Billy Sales & Services</a>
                  </td>
                </tr>
              </table>
             
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/footer.png" alt="Footer" style="width: 100%; max-width: 600px; display: block; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;" />
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  /**
   * Envía una alerta por correo electrónico si un ticket ha estado desatendido por X horas.
   */
  async sendTicketUnattendedAlert(
    to: string,
    ticketNumber: string,
    ticketTitle: string,
    elapsedTime: string,
    tipoIncidencia: string,
    username: string,
  ): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM') || '"Billy Sales & Services" <noreply@tibs.com.mx>';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const apiUrl = this.getApiUrl();
    const formattedUsername = username ? username.charAt(0).toUpperCase() + username.slice(1) : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Alerta de Ticket sin Atender - Billy Sales & Services</title>
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
        </style>
      </head>
      <body style="background-color: #f8fafc; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 0; margin: 0; width: 100%;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="550" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; margin: 0 auto;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/header_helpdesk_alert.png" alt="Header" style="width: 100%; max-width: 550px; display: block; border-top-left-radius: 16px; border-top-right-radius: 16px;" />
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 40px 30px; text-align: left;">
              <p style="color: #000000; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 700; margin: 0 0 20px 0;">
                Hola ${formattedUsername},
              </p>
              <p style="color: #334155; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; margin: 0 0 24px 0; line-height: 1.6;">
                Se ha generado un nuevo ticket en la Mesa de Ayuda que requiere <strong>atención inmediata</strong>, ya que ha permanecido sin un agente asignado durante un periodo mayor al esperado.
              </p>

              <!-- Ticket Info Card -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                <tr>
                  <td style="padding: 24px; text-align: left;">
                    <!-- Badge at top right and title on left -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                      <tr>
                        <td align="left">
                          <p style="margin: 0; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; color: #334155;">
                            <strong>Tipo de alerta:</strong> ${tipoIncidencia || 'Falla'}
                          </p>
                        </td>
                        <td align="right" valign="top">
                          <span style="background-color: #d1fae5; color: #065f46; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; display: inline-block;">
                            Ticket #${ticketNumber}
                          </span>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="color: #334155; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; margin: 0 0 16px 0; line-height: 1.6;">
                      Este caso ha permanecido <strong>${elapsedTime}</strong> en estado <strong>Nuevo</strong>, sin que se haya asignado un agente responsable para su atención.
                    </p>
                    
                    <p style="color: #334155; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; margin: 0; line-height: 1.6;">
                      Debido al tiempo transcurrido, es necesario asignar un responsable y dar seguimiento al ticket a la <strong>brevedad</strong>, con el fin de evitar mayores retrasos y asegurar el cumplimiento de los niveles de servicio establecidos.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="color: #334155; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; margin: 0 0 28px 0;">
                Por favor, ingresa a la plataforma para asignar un <strong>responsable</strong> y realizar el seguimiento correspondiente.
              </p>

              <!-- Action Button -->
              <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-top: 10px; margin-bottom: 16px; width: 100%;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" style="background-color: #054c04; border-radius: 24px;">
                      <tr>
                        <td align="center" style="padding: 12px 32px;">
                          <a href="${frontendUrl}/helpdesk" target="_blank" style="font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: #00e600; text-decoration: none; display: inline-block;">Asignar ticket a agente</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/footer.png" alt="Footer" style="width: 100%; max-width: 550px; display: block; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;" />
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `Alerta: Ticket #${ticketNumber} sin atender por ${elapsedTime}`,
        html: htmlContent,
      });
      this.logger.log(`Alerta de ticket #${ticketNumber} enviada con éxito a ${to}`);
    } catch (error) {
      this.logger.error(`Error al enviar correo de alerta de ticket #${ticketNumber} a ${to}:`, error);
      throw error;
    }
  }

  /**
   * Envía un correo de notificación individual / alerta interna.
   */
  async sendGeneralNotificationEmail(
    to: string,
    title: string,
    message: string,
    actionUrl?: string,
    notificationType?: string,
    username?: string,
  ): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM') || '"Billy Sales & Services" <noreply@tibs.com.mx>';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const targetUrl = actionUrl || frontendUrl;
    const apiUrl = this.getApiUrl();
    const formattedUsername = username ? username.charAt(0).toUpperCase() + username.slice(1) : '';

    // Mapeo de tipo de notificación a su respectiva imagen de cabecera
    const headerImageMap: Record<string, string> = {
      // Oportunidades
      opportunity_created: 'header_assign_opportunity.png',
      opportunity_assigned: 'header_assign_opportunity.png',
      opportunity_moved: 'header_opportunity_movement.png',
      opportunity_updated: 'header_opportunity_modified.png',
      opportunity_file_added: 'header_opportunity_modified.png',
      opportunity_file_deleted: 'header_file_deleted.png',
      opportunity_red: 'header_missed_opportunity.png',

      // Actividades
      activity_created: 'header_new_activity.png',
      activity_updated: 'header_activity_modified.png',
      activity_deleted: 'header_file_deleted.png',
      activity_reminder: 'header_reminder_activity.png',

      // Tickets
      ticket_assigned: 'header_ticket_assign.png',
      ticket_moved: 'header_ticket_movement.png',
      ticket_updated: 'header_ticket_modified.png',
    };

    const headerImage = (notificationType && headerImageMap[notificationType]) || 'header_assign_opportunity.png';

    let buttonText = 'Ver en el CRM';
    if (notificationType === 'ticket_moved' || notificationType === 'opportunity_moved') {
      buttonText = 'Ver movimiento en el CRM';
    } else if (notificationType === 'ticket_assigned' || notificationType === 'opportunity_assigned') {
      buttonText = 'Ver asignación en el CRM';
    } else if (notificationType === 'opportunity_updated') {
      buttonText = 'Ver actualización en el CRM';
    } else if (
      notificationType === 'opportunity_file_deleted' ||
      notificationType === 'activity_deleted' ||
      notificationType === 'activity_updated' ||
      notificationType === 'ticket_updated'
    ) {
      buttonText = 'Ver cambios en el CRM';
    } else if (notificationType?.includes('opportunity')) {
      buttonText = 'Ver oportunidad en el CRM';
    } else if (notificationType?.includes('ticket')) {
      buttonText = 'Ver ticket en el CRM';
    } else if (notificationType?.includes('activity')) {
      buttonText = 'Ver recordatorio en el CRM';
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Billy Sales & Services</title>
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
        </style>
      </head>
      <body style="background-color: #f8fafc; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 0; margin: 0; width: 100%;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="550" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; margin: 0 auto;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/${headerImage}" alt="Header" style="width: 100%; max-width: 550px; display: block; border-top-left-radius: 16px; border-top-right-radius: 16px;" />
            </td>
          </tr>
          <!-- CONTENT -->
          <tr>
            <td style="padding: 40px 30px; text-align: left;">
              ${formattedUsername ? `
              <p style="color: #000000; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 700; margin: 0 0 20px 0;">
                Hola ${formattedUsername},
              </p>
              ` : ''}
              <p style="color: #334155; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; margin: 0 0 24px 0; line-height: 1.6;">
                ${message}
              </p>

              <!-- CTA BUTTON -->
              <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-top: 10px; margin-bottom: 16px; width: 100%;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" style="background-color: #054c04; border-radius: 24px;">
                      <tr>
                        <td align="center" style="padding: 12px 32px;">
                          <a href="${targetUrl}" target="_blank" style="font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: #00e600; text-decoration: none; display: inline-block;">${buttonText}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/footer.png" alt="Footer" style="width: 100%; max-width: 550px; display: block; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;" />
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `${title}`,
        html: htmlContent,
      });
      this.logger.log(`Correo de notificación "${title}" enviado con éxito a ${to}`);
    } catch (error) {
      this.logger.error(`Error al enviar correo de notificación a ${to}:`, error);
    }
  }

  /**
   * Envía un correo electrónico de recordatorio de actividad a un cliente o contacto.
   */
  async sendActivityReminderToClient(
    to: string,
    clientName: string,
    activityTitle: string,
    reminderTitle: string,
    date: Date,
    opportunityName?: string,
  ): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM') || '"Billy Sales & Services" <noreply@tibs.com.mx>';
    const apiUrl = this.getApiUrl();
    const formattedClientName = clientName ? clientName.trim() : 'Estimado(a) cliente';

    const formattedDate = new Date(date).toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recordatorio de Actividad - Billy Sales & Services</title>
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
        </style>
      </head>
      <body style="background-color: #f8fafc; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 0; margin: 0; width: 100%;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="550" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; margin: 0 auto;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/header_reminder_activity.png" alt="Header" style="width: 100%; max-width: 550px; display: block; border-top-left-radius: 16px; border-top-right-radius: 16px;" />
            </td>
          </tr>
          <!-- CONTENT -->
          <tr>
            <td style="padding: 40px 30px; text-align: left;">
              <p style="color: #000000; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 700; margin: 0 0 20px 0;">
                Hola ${formattedClientName},
              </p>
              <p style="color: #334155; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; margin: 0 0 24px 0; line-height: 1.6;">
                Te enviamos un cordial saludo. Le recordamos que tiene una actividad programada en nuestro sistema:
              </p>

              <!-- CARD -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px; text-align: left;">
                    <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: #1e293b;">
                      ${reminderTitle || activityTitle || 'Recordatorio de Actividad'}
                    </p>
                    ${activityTitle ? `<p style="margin: 0 0 8px 0; font-size: 14px; color: #475569;"><strong>Actividad:</strong> ${activityTitle}</p>` : ''}
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #475569;">
                      <strong>Fecha y Hora:</strong> ${formattedDate}
                    </p>
                    ${opportunityName ? `<p style="margin: 0; font-size: 14px; color: #475569;"><strong>Oportunidad:</strong> ${opportunityName}</p>` : ''}
                  </td>
                </tr>
              </table>

              <p style="color: #64748b; font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; margin: 0; line-height: 1.6;">
                Si tiene alguna duda o requiere reprogramar, por favor póngase en contacto con su ejecutivo asignado.
              </p>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding: 0; text-align: center;">
              <img src="${apiUrl}/static/footer.png" alt="Footer" style="width: 100%; max-width: 550px; display: block; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;" />
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `Recordatorio: ${reminderTitle || activityTitle}`,
        html: htmlContent,
      });
      this.logger.log(`Correo de recordatorio enviado a cliente ${to}`);
    } catch (error) {
      this.logger.error(`Error al enviar correo de recordatorio a cliente ${to}:`, error);
    }
  }

  /**
   * Retorna los colores de la etiqueta según el tipo de actividad para enriquecer visualmente el correo.
   */
  private getActivityTypeBadgeColor(type: string): { bg: string; fg: string } {
    switch (type) {
      case 'Correo':
        return { bg: '#eff6ff', fg: '#1d4ed8' };
      case 'Llamada':
        return { bg: '#faf5ff', fg: '#7e22ce' };
      case 'Presentación Servicios Presencial':
      case 'Presentación Servicios En Línea':
        return { bg: '#fff7ed', fg: '#c2410c' };
      case 'Seguimiento Oportunidad Línea':
      case 'Seguimiento Oportunidad Presencial':
        return { bg: '#ecfdf5', fg: '#047857' };
      case 'Evento':
        return { bg: '#fff1f2', fg: '#be123c' };
      default:
        return { bg: '#f1f5f9', fg: '#475569' };
    }
  }
}
