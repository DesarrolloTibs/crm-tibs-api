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

    const htmlContent = this.generateHtmlTemplate(username, todayStr, reminders, activities);

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
   * Genera el diseño HTML premium para el correo electrónico.
   */
  private generateHtmlTemplate(
    username: string,
    dateStr: string,
    reminders: any[],
    activities: any[],
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
