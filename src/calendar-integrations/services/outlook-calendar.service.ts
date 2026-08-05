import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { UserCalendarIntegration } from '../entities/user-calendar-integration.entity';

@Injectable()
export class OutlookCalendarService {
  private readonly logger = new Logger('OutlookCalendarService');

  constructor(private readonly configService: ConfigService) {}

  /**
   * Genera la URL de autorización para Microsoft Graph (Outlook).
   */
  getAuthUrl(state: string): string {
    const clientId = this.configService.get<string>('OUTLOOK_CLIENT_ID');
    const redirectUri = this.configService.get<string>('OUTLOOK_REDIRECT_URI');

    const params = new URLSearchParams({
      client_id: clientId!,
      response_type: 'code',
      redirect_uri: redirectUri!,
      response_mode: 'query',
      scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
      state,
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Intercambia el código de autorización por tokens de acceso y refresco de Microsoft Graph.
   */
  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date; email: string }> {
    const clientId = this.configService.get<string>('OUTLOOK_CLIENT_ID');
    const clientSecret = this.configService.get<string>('OUTLOOK_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('OUTLOOK_REDIRECT_URI');

    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
        code,
        redirect_uri: redirectUri!,
        grant_type: 'authorization_code',
        client_secret: clientSecret!,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Error al intercambiar código de Outlook: ${errorText}`);
      throw new Error('No se pudo autenticar con Outlook Calendar.');
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    // Obtener información del usuario firmado
    const meResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    let email = 'Outlook Account';
    if (meResponse.ok) {
      const me = await meResponse.json();
      email = me.mail || me.userPrincipalName || 'Outlook Account';
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      email,
    };
  }

  /**
   * Refresca los tokens de Microsoft Graph.
   */
  async getValidToken(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
  ): Promise<string> {
    const now = new Date();
    // Margen de 5 minutos
    if (
      integration.expiresAt &&
      new Date(integration.expiresAt).getTime() - now.getTime() > 5 * 60 * 1000
    ) {
      return integration.accessToken!;
    }

    this.logger.log(`Refrescando token de Outlook para usuario: ${integration.userId}`);
    const clientId = this.configService.get<string>('OUTLOOK_CLIENT_ID');
    const clientSecret = this.configService.get<string>('OUTLOOK_CLIENT_SECRET');

    if (!integration.refreshToken) {
      throw new Error('Falta refresh token de Outlook.');
    }

    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
        refresh_token: integration.refreshToken,
        grant_type: 'refresh_token',
        client_secret: clientSecret!,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Error al refrescar token de Outlook: ${errorText}`);
      throw new Error('Error al refrescar credenciales de Outlook.');
    }

    const data = await response.json();
    integration.accessToken = data.access_token;
    if (data.expires_in) {
      integration.expiresAt = new Date(Date.now() + data.expires_in * 1000);
    }
    // Microsoft Graph a veces rota el refresh token, lo actualizamos si viene uno nuevo
    if (data.refresh_token) {
      integration.refreshToken = data.refresh_token;
    }
    await integrationRepo.save(integration);
    return integration.accessToken!;
  }

  /**
   * Crea un evento en Outlook Calendar.
   */
  async createEvent(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    eventDetails: { title: string; description: string; date: Date },
  ): Promise<string> {
    const token = await this.getValidToken(integration, integrationRepo);

    const start = new Date(eventDetails.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hora

    const response = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: eventDetails.title,
        body: {
          contentType: 'HTML',
          content: eventDetails.description,
        },
        start: {
          dateTime: start.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: 'UTC',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al crear evento en Outlook: ${err}`);
      throw new Error('No se pudo crear el evento en Outlook Calendar.');
    }

    const event = await response.json();
    return event.id;
  }

  /**
   * Actualiza un evento en Outlook.
   */
  async updateEvent(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    externalEventId: string,
    eventDetails: { title: string; description: string; date: Date },
  ): Promise<void> {
    const token = await this.getValidToken(integration, integrationRepo);

    const start = new Date(eventDetails.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${externalEventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: eventDetails.title,
        body: {
          contentType: 'HTML',
          content: eventDetails.description,
        },
        start: {
          dateTime: start.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: 'UTC',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al actualizar evento en Outlook: ${err}`);
      if (response.status === 404) {
        throw new Error('EVENT_NOT_FOUND');
      }
      throw new Error('No se pudo actualizar el evento en Outlook Calendar.');
    }
  }

  /**
   * Elimina un evento de Outlook.
   */
  async deleteEvent(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    externalEventId: string,
  ): Promise<void> {
    const token = await this.getValidToken(integration, integrationRepo);

    const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${externalEventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok && response.status !== 404) {
      const err = await response.text();
      this.logger.error(`Error al eliminar evento en Outlook: ${err}`);
      throw new Error('No se pudo eliminar el evento en Outlook Calendar.');
    }
  }

  /**
   * Crea una suscripción de webhook para Graph API.
   * Nota: Graph limita la validez máxima de suscripción de eventos a 4230 minutos (~2.9 días).
   */
  async createWebhookSubscription(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    subscriptionId: string,
  ): Promise<{ expiration: Date }> {
    const token = await this.getValidToken(integration, integrationRepo);
    const serverUrl = this.configService.get<string>('API_URL') || this.configService.get<string>('PUBLIC_SERVER_URL');
    const webhookAddress = `${serverUrl!.replace(/\/$/, '')}/api/calendar-webhooks/outlook`;

    // Expiración en 2.8 días para estar dentro del límite
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + 4000);

    const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        changeType: 'updated,deleted',
        notificationUrl: webhookAddress,
        resource: 'me/events',
        expirationDateTime: expiration.toISOString(),
        clientState: subscriptionId, // Se almacena como clientState para validación
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al suscribir webhook en Microsoft Graph: ${err}`);
      throw new Error('No se pudo activar el webhook en Outlook Calendar.');
    }

    const data = await response.json();
    return {
      expiration: new Date(data.expirationDateTime),
    };
  }

  /**
   * Elimina una suscripción de webhook de Microsoft Graph.
   */
  async stopWebhookSubscription(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    subscriptionId: string,
  ): Promise<void> {
    const token = await this.getValidToken(integration, integrationRepo);

    const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok && response.status !== 404) {
      const err = await response.text();
      this.logger.error(`Error al detener suscripción de Microsoft Graph: ${err}`);
    }
  }

  /**
   * Sincroniza cambios usando Graph API Delta queries.
   */
  async getSyncChanges(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
  ): Promise<{ items: any[]; nextSyncToken: string | null }> {
    const token = await this.getValidToken(integration, integrationRepo);

    let url = integration.syncToken || '';
    
    // Si no hay deltaLink previo, inicializar una consulta delta
    if (!url || !url.startsWith('http')) {
      const start = new Date();
      start.setDate(start.getDate() - 1); // Desde ayer
      const end = new Date();
      end.setDate(end.getDate() + 30); // 30 días al futuro

      url = `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}`;
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Si delta token es inválido o expiró, intentamos hacer un reset sin token
    if (!response.ok && integration.syncToken) {
      this.logger.warn('Delta Link de Microsoft Graph inválido. Reintentando sincronización completa...');
      const start = new Date();
      start.setDate(start.getDate() - 1);
      const end = new Date();
      end.setDate(end.getDate() + 30);

      const fallbackUrl = `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}`;
      const retryResponse = await fetch(fallbackUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!retryResponse.ok) {
        const err = await retryResponse.text();
        throw new Error(`Error en delta sync fallback de Outlook: ${err}`);
      }
      const data = await retryResponse.json();
      return {
        items: data.value || [],
        nextSyncToken: data['@odata.deltaLink'] || null,
      };
    }

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error en delta query de Outlook: ${err}`);
      throw new Error('No se pudieron descargar los cambios de Outlook.');
    }

    const data = await response.json();
    return {
      items: data.value || [],
      nextSyncToken: data['@odata.deltaLink'] || null,
    };
  }
}
