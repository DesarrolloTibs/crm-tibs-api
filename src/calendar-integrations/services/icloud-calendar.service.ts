import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { UserCalendarIntegration } from '../entities/user-calendar-integration.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ICloudCalendarService {
  private readonly logger = new Logger('ICloudCalendarService');

  constructor(private readonly configService: ConfigService) {}

  /**
   * Encripta una contraseña con AES-256-CBC usando JWT_SECRET.
   */
  encryptPassword(password: string): string {
    const secret = this.configService.get<string>('JWT_SECRET') || 'default_backup_secret_key_32_chars';
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Desencripta una contraseña encriptada.
   */
  decryptPassword(encryptedData: string): string {
    const secret = this.configService.get<string>('JWT_SECRET') || 'default_backup_secret_key_32_chars';
    const key = crypto.createHash('sha256').update(secret).digest();
    
    const [ivHex, encryptedHex] = encryptedData.split(':');
    if (!ivHex || !encryptedHex) {
      throw new Error('Formato de contraseña encriptada inválido.');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Descubre y retorna el URL base de los calendarios del usuario de iCloud (calendar-home-set).
   */
  async discoverCalendarHome(email: string, appPassword: string): Promise<string> {
    const authHeader = `Basic ${Buffer.from(`${email}:${appPassword}`).toString('base64')}`;

    // Paso 1: Obtener la URL del principal
    let response = await fetch('https://caldav.icloud.com/', {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader,
        Depth: '0',
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: `
        <d:propfind xmlns:d="DAV:">
          <d:prop>
            <d:current-user-principal />
          </d:prop>
        </d:propfind>
      `,
    });

    if (!response.ok) {
      throw new Error('Credenciales de iCloud inválidas o error de conexión.');
    }

    let text = await response.text();
    const principalMatch = text.match(/<current-user-principal>\s*<href>([^<]+)<\/href>/i) ||
                           text.match(/<href>([^<]*\/principal\/[^<]*)<\/href>/i);
    
    if (!principalMatch || !principalMatch[1]) {
      throw new Error('No se pudo descubrir el principal del usuario en iCloud.');
    }

    const principalUrl = principalMatch[1].startsWith('http')
      ? principalMatch[1]
      : `https://caldav.icloud.com${principalMatch[1]}`;

    // Paso 2: Obtener el calendar-home-set
    response = await fetch(principalUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader,
        Depth: '0',
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: `
        <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:prop>
            <c:calendar-home-set />
          </d:prop>
        </d:propfind>
      `,
    });

    if (!response.ok) {
      throw new Error('Error al consultar calendar-home-set en iCloud.');
    }

    text = await response.text();
    const homeMatch = text.match(/<calendar-home-set>\s*<href>([^<]+)<\/href>/i) ||
                      text.match(/<href>([^<]*\/calendars\/[^<]*)<\/href>/i);

    if (!homeMatch || !homeMatch[1]) {
      throw new Error('No se pudo descubrir la ruta de calendarios en iCloud.');
    }

    return homeMatch[1].startsWith('http')
      ? homeMatch[1]
      : `https://caldav.icloud.com${homeMatch[1]}`;
  }

  /**
   * Obtiene la lista de calendarios disponibles en la cuenta de iCloud del usuario.
   */
  async getCalendarsList(email: string, appPassword: string, homeUrl: string): Promise<{ id: string; name: string }[]> {
    const authHeader = `Basic ${Buffer.from(`${email}:${appPassword}`).toString('base64')}`;

    const response = await fetch(homeUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader,
        Depth: '1',
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: `
        <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:prop>
            <d:displayname />
            <c:supported-calendar-component-set />
          </d:prop>
        </d:propfind>
      `,
    });

    if (!response.ok) {
      throw new Error('Error al listar calendarios en iCloud.');
    }

    const text = await response.text();
    const calendars: { id: string; name: string }[] = [];

    // Parseo rústico pero confiable del XML de respuesta
    const responseBlocks = text.split('<response>');
    for (const block of responseBlocks) {
      if (!block.includes('<href>')) continue;
      
      const hrefMatch = block.match(/<href>([^<]+)<\/href>/i);
      const nameMatch = block.match(/<displayname>([^<]+)<\/displayname>/i);
      const isCal = block.includes('VEVENT');

      if (hrefMatch && isCal) {
        const href = hrefMatch[1];
        // Omitimos la raíz de calendarios
        if (href.endsWith('/calendars/') || href.replace(/\/$/, '') === homeUrl.replace(/.*caldav\.icloud\.com/, '').replace(/\/$/, '')) continue;
        
        calendars.push({
          id: href.startsWith('http') ? href : `https://caldav.icloud.com${href}`,
          name: nameMatch ? nameMatch[1] : 'Calendario Personal',
        });
      }
    }

    return calendars;
  }

  /**
   * Sincroniza una actividad hacia iCloud CalDAV en formato iCalendar (.ics).
   */
  async createOrUpdateEvent(
    integration: UserCalendarIntegration,
    externalEventId: string,
    eventDetails: { title: string; description: string; date: Date },
  ): Promise<void> {
    const appPassword = this.decryptPassword(integration.icloudPassword!);
    const authHeader = `Basic ${Buffer.from(`${integration.icloudEmail}:${appPassword}`).toString('base64')}`;
    const calendarUrl = integration.calendarId!;

    const eventUrl = `${calendarUrl.replace(/\/$/, '')}/${externalEventId}.ics`;

    const start = new Date(eventDetails.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hora
    const now = new Date();

    const formatCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Billy CRM//CalDAV Client//ES',
      'BEGIN:VEVENT',
      `UID:${externalEventId}`,
      `DTSTAMP:${formatCalDate(now)}`,
      `DTSTART:${formatCalDate(start)}`,
      `DTEND:${formatCalDate(end)}`,
      `SUMMARY:${eventDetails.title}`,
      `DESCRIPTION:${eventDetails.description.replace(/\n/g, '\\n')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const response = await fetch(eventUrl, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body: icsContent,
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al subir evento a iCloud (${response.status}): ${err}`);
      throw new Error('No se pudo guardar el evento en iCloud.');
    }
  }

  /**
   * Elimina un evento de iCloud.
   */
  async deleteEvent(integration: UserCalendarIntegration, externalEventId: string): Promise<void> {
    const appPassword = this.decryptPassword(integration.icloudPassword!);
    const authHeader = `Basic ${Buffer.from(`${integration.icloudEmail}:${appPassword}`).toString('base64')}`;
    const calendarUrl = integration.calendarId!;
    const eventUrl = `${calendarUrl.replace(/\/$/, '')}/${externalEventId}.ics`;

    const response = await fetch(eventUrl, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });

    if (!response.ok && response.status !== 404) {
      const err = await response.text();
      this.logger.error(`Error al eliminar evento en iCloud (${response.status}): ${err}`);
      throw new Error('No se pudo eliminar el evento de iCloud.');
    }
  }

  /**
   * Sincroniza cambios desde iCloud leyendo eventos mediante calendar-query.
   */
  async getSyncChanges(integration: UserCalendarIntegration): Promise<any[]> {
    const appPassword = this.decryptPassword(integration.icloudPassword!);
    const authHeader = `Basic ${Buffer.from(`${integration.icloudEmail}:${appPassword}`).toString('base64')}`;
    const calendarUrl = integration.calendarId!;

    // Polling del rango: Ayer a 30 días en adelante
    const start = new Date();
    start.setDate(start.getDate() - 1);
    const end = new Date();
    end.setDate(end.getDate() + 30);

    const formatCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const response = await fetch(calendarUrl, {
      method: 'REPORT',
      headers: {
        Authorization: authHeader,
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: `
        <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:prop>
            <d:getetag />
            <c:calendar-data />
          </d:prop>
          <c:filter>
            <c:comp-filter name="VCALENDAR">
              <c:comp-filter name="VEVENT">
                <c:time-range start="${formatCalDate(start)}" end="${formatCalDate(end)}" />
              </c:comp-filter>
            </c:comp-filter>
          </c:filter>
        </c:calendar-query>
      `,
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al consultar REPORT en iCloud: ${err}`);
      throw new Error('No se pudieron obtener los cambios de iCloud.');
    }

    const text = await response.text();
    const items: any[] = [];
    const responseBlocks = text.split('<response>');

    for (const block of responseBlocks) {
      if (!block.includes('<calendar-data>')) continue;
      
      const icsMatch = block.match(/<calendar-data>([^<]+)<\/calendar-data>/i) ||
                       block.match(/BEGIN:VCALENDAR[\s\S]*END:VCALENDAR/i);
      
      if (icsMatch) {
        const icsText = icsMatch[0]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/<calendar-data>/i, '')
          .replace(/<\/calendar-data>/i, '');

        const event = this.parseICS(icsText);
        if (event && event.uid) {
          items.push(event);
        }
      }
    }

    return items;
  }

  /**
   * Parser simple de formato iCalendar para extraer campos clave.
   */
  private parseICS(icsText: string): any {
    const lines = icsText.split(/\r?\n/);
    const event: any = {};
    let currentKey = '';

    for (let line of lines) {
      // Manejar líneas continuas (plegado RFC 5545)
      if (line.startsWith(' ') || line.startsWith('\t')) {
        if (currentKey) {
          event[currentKey] += line.substring(1);
        }
        continue;
      }

      const match = line.match(/^([A-Z0-9-]+)(?:;[^:]*)?:(.*)$/i);
      if (match) {
        const [, key, value] = match;
        const normalizedKey = key.toUpperCase();
        
        if (normalizedKey === 'UID') {
          event.uid = value.trim();
          currentKey = 'uid';
        } else if (normalizedKey === 'SUMMARY') {
          event.summary = value.trim();
          currentKey = 'summary';
        } else if (normalizedKey === 'DESCRIPTION') {
          event.description = value.trim().replace(/\\n/g, '\n');
          currentKey = 'description';
        } else if (normalizedKey === 'DTSTART') {
          event.start = this.parseICSDate(value.trim());
          currentKey = 'start';
        } else if (normalizedKey === 'DTEND') {
          event.end = this.parseICSDate(value.trim());
          currentKey = 'end';
        } else {
          currentKey = '';
        }
      }
    }

    return event;
  }

  /**
   * Convierte fechas de formato iCalendar (ej: 20260804T183000Z) a objeto Date de JS.
   */
  private parseICSDate(val: string): Date | null {
    const cleanVal = val.replace(/[^0-9TZ]/g, '');
    if (cleanVal.length < 8) return null;

    const year = parseInt(cleanVal.substring(0, 4), 10);
    const month = parseInt(cleanVal.substring(4, 6), 10) - 1;
    const day = parseInt(cleanVal.substring(6, 8), 10);

    if (cleanVal.includes('T')) {
      const hour = parseInt(cleanVal.substring(9, 11), 10) || 0;
      const min = parseInt(cleanVal.substring(11, 13), 10) || 0;
      const sec = parseInt(cleanVal.substring(13, 15), 10) || 0;

      if (cleanVal.endsWith('Z')) {
        return new Date(Date.UTC(year, month, day, hour, min, sec));
      }
      return new Date(year, month, day, hour, min, sec);
    }

    return new Date(year, month, day);
  }
}
