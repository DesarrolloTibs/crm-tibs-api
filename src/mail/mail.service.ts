import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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

  /**
   * Envía el resumen diario de actividades y recordatorios a un usuario.
   */
  async sendDailySummary(
    to: string,
    username: string,
    reminders: any[],
    activities: any[],
  ): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM') || '"Friday" <noreply@tibs.com.mx>';
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
        subject: `📅 Resumen Diario de Actividades y Recordatorios - ${todayStr}`,
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
  async sendResetPasswordEmail(email: string, token: string): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM') || '"Friday" <noreply@tibs.com.mx>';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Restablecer Contraseña - Friday</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f1f5f9;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
        </style>
      </head>
      <body style="background-color: #f8fafc; font-family: 'Outfit', 'Inter', sans-serif; padding: 40px 0; margin: 0; width: 100%;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="550" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; margin: 0 auto;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 36px 30px; text-align: center;">
              <span style="color: #6366f1; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; display: block; margin-bottom: 8px;">Friday</span>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Restablecer tu Contraseña</h1>
            </td>
          </tr>
          <!-- CONTENT -->
          <tr>
            <td style="padding: 40px 30px; text-align: center;">
              <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid #f1f5f9; text-align: left;">
                <p style="color: #334155; font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
                  Hola,
                </p>
                <p style="color: #64748b; font-size: 14px; margin: 0 0 16px 0; line-height: 1.5;">
                  Recibimos una solicitud para restablecer la contraseña de tu cuenta en **Friday**. Para continuar con el proceso, haz clic en el siguiente botón:
                </p>
              </div>

              <!-- CTA BUTTON -->
              <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-top: 10px; margin-bottom: 24px;">
                <tr>
                  <td align="center" style="background-color: #4f46e5; border-radius: 10px;">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">Restablecer mi contraseña</a>
                  </td>
                </tr>
              </table>

              <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0 0; line-height: 1.5; text-align: center;">
                Este enlace de recuperación es válido por <strong>1 hora</strong>.<br/>
                Si tú no solicitaste este cambio, puedes ignorar este correo de forma segura.
              </p>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 30px; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0 0 6px 0;">Este correo ha sido generado automáticamente por el sistema Friday.</p>
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">&copy; 2026 TIBS. Todos los derechos reservados.</p>
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
        subject: '🔒 Restablecer Contraseña - Friday',
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

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resumen Diario Friday</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f1f5f9;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
          table {
            border-collapse: collapse;
          }
        </style>
      </head>
      <body style="background-color: #f8fafc; font-family: 'Outfit', 'Inter', sans-serif; padding: 20px 0; margin: 0; width: 100%;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; margin: 0 auto;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 36px 30px; text-align: center;">
              <span style="color: #6366f1; font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; display: block; margin-bottom: 8px;">Friday</span>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Tu Agenda del Día</h1>
              <p style="color: #c7d2fe; font-size: 14px; margin: 8px 0 0 0; font-weight: 400;">${dateStr}</p>
            </td>
          </tr>
          <!-- CONTENT -->
          <tr>
            <td style="padding: 30px 30px;">
              <p style="color: #334155; font-size: 16px; margin: 0 0 24px 0; line-height: 1.5;">
                Hola <strong style="color: #1e1b4b;">${username}</strong>,
              </p>
              <p style="color: #64748b; font-size: 14px; margin: 0 0 28px 0; line-height: 1.5;">
                A continuación se muestra el listado de los recordatorios y las actividades bajo tu responsabilidad programados para el día de hoy. ¡Que tengas un excelente día de trabajo!
              </p>

              <!-- RECORDATORIOS SECTION -->
              <div style="margin-bottom: 32px;">
                <h3 style="color: #1e1b4b; border-bottom: 2px solid #ecfdf5; padding-bottom: 8px; margin: 0 0 16px 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;">
                  <span style="margin-right: 8px;">🔔</span> Recordatorios de Oportunidades
                </h3>
                ${remindersHtml}
              </div>

              <!-- ACTIVIDADES SECTION -->
              <div style="margin-bottom: 24px;">
                <h3 style="color: #1e1b4b; border-bottom: 2px solid #eff6ff; padding-bottom: 8px; margin: 0 0 16px 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;">
                  <span style="margin-right: 8px;">📋</span> Actividades Programadas
                </h3>
                ${activitiesHtml}
              </div>
              
              <!-- CTA BUTTON -->
              <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-top: 32px; margin-bottom: 16px; text-align: center; margin: 32px auto 16px auto;">
                <tr>
                  <td align="center" style="background-color: #4f46e5; border-radius: 10px;">
                    <a href="${frontendUrl}/login" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">Acceder a Friday</a>
                  </td>
                </tr>
              </table>
             
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 30px; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0 0 6px 0;">Este correo ha sido generado automáticamente por el sistema Friday.</p>
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">&copy; 2026 TIBS. Todos los derechos reservados.</p>
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
  ): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM') || '"Friday" <noreply@tibs.com.mx>';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Alerta de Ticket sin Atender - Friday</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      </head>
      <body style="background-color: #f8fafc; font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 0; margin: 0; width: 100%; -webkit-font-smoothing: antialiased;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="550" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; margin: 0 auto;">
          <!-- Top Accent Bar -->
          <tr>
            <td style="background-color: #f43f5e; height: 6px; line-height: 6px; font-size: 1px;">&nbsp;</td>
          </tr>
          
          <!-- Header/Logo Area -->
          <tr>
            <td align="center" style="padding: 32px 30px 20px 30px; text-align: center;">
              <span style="color: #6366f1; font-weight: 700; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; display: block; margin-bottom: 4px;">Friday CRM</span>
              <h1 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Alerta de Mesa de Ayuda</h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 0 35px 30px 35px;">
              <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                Estimado Administrador,
              </p>
              <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
                Se ha detectado un ticket en la Mesa de Ayuda que requiere atención inmediata por llevar demasiado tiempo sin un agente asignado:
              </p>

              <!-- Ticket Info Card -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 24px;">
                    <!-- Badge: Ticket Number -->
                    <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 12px;">
                      <tr>
                        <td style="background-color: #ffe4e6; color: #e11d48; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                          Ticket #${ticketNumber}
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Ticket Title -->
                    <h2 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 700; color: #0f172a; line-height: 1.4;">
                      ${ticketTitle}
                    </h2>
                    
                    <!-- Warning / Info Detail -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="24" valign="top" style="padding-top: 2px;">
                          <span style="font-size: 16px; line-height: 1;">⚠️</span>
                        </td>
                        <td style="padding-left: 8px; color: #475569; font-size: 14px; line-height: 1.5;">
                          Este caso lleva <strong style="color: #0f172a;">${elapsedTime}</strong> en estado <strong style="color: #6366f1;">Nuevo</strong> sin un agente responsable asignado.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 28px 0; text-align: center;">
                Por favor, ingresa a la plataforma para asignar un responsable y dar el seguimiento correspondiente.
              </p>

              <!-- Action Button -->
              <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 12px;">
                <tr>
                  <td align="center" style="background-color: #4f46e5; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
                    <a href="${frontendUrl}/helpdesk" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">
                      Ver Mesa de Ayuda
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 30px; text-align: center; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0 0 6px 0; font-weight: 500;">Este correo ha sido generado automáticamente por el sistema Friday.</p>
              <p style="color: #cbd5e1; font-size: 11px; margin: 0;">&copy; 2026 TIBS. Todos los derechos reservados.</p>
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
        subject: `⚠️ Alerta: Ticket #${ticketNumber} sin atender por ${elapsedTime}`,
        html: htmlContent,
      });
      this.logger.log(`Alerta de ticket #${ticketNumber} enviada con éxito a ${to}`);
    } catch (error) {
      this.logger.error(`Error al enviar correo de alerta de ticket #${ticketNumber} a ${to}:`, error);
      throw error;
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
