import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { UserCalendarIntegration } from '../entities/user-calendar-integration.entity';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger('GoogleCalendarService');

  constructor(private readonly configService: ConfigService) {}

  /**
   * Genera la URL de autorización para el flujo OAuth2 de Google.
   */
  getAuthUrl(state: string): string {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');
    
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri!,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Intercambia el código de autorización por tokens de acceso y refresco.
   */
  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date; email: string }> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri!,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Error al intercambiar código de Google: ${errorText}`);
      throw new Error('No se pudo autenticar con Google Calendar.');
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    // Obtener información del perfil del usuario (email)
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    let email = 'Google Account';
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      email = profile.email;
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || '',
      expiresAt,
      email,
    };
  }

  /**
   * Obtiene un token válido, refrescándolo si ha expirado.
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

    this.logger.log(`Refrescando token de Google para usuario: ${integration.userId}`);
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!integration.refreshToken) {
      throw new Error('Falta refresh token de Google.');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        refresh_token: integration.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Error al refrescar token de Google: ${errorText}`);
      throw new Error('Error al refrescar credenciales de Google.');
    }

    const data = await response.json();
    integration.accessToken = data.access_token;
    if (data.expires_in) {
      integration.expiresAt = new Date(Date.now() + data.expires_in * 1000);
    }
    await integrationRepo.save(integration);
    return integration.accessToken!;
  }

  /**
   * Crea un evento en el calendario de Google.
   */
  async createEvent(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    eventDetails: { title: string; description: string; date: Date },
  ): Promise<string> {
    const token = await this.getValidToken(integration, integrationRepo);
    const calendarId = integration.calendarId || 'primary';

    const start = new Date(eventDetails.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hora de duración

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: eventDetails.title,
          description: eventDetails.description,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al crear evento en Google: ${err}`);
      throw new Error('No se pudo crear el evento en Google Calendar.');
    }

    const event = await response.json();
    return event.id;
  }

  /**
   * Actualiza un evento en Google Calendar.
   */
  async updateEvent(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    externalEventId: string,
    eventDetails: { title: string; description: string; date: Date },
  ): Promise<void> {
    const token = await this.getValidToken(integration, integrationRepo);
    const calendarId = integration.calendarId || 'primary';

    const start = new Date(eventDetails.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events/${externalEventId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: eventDetails.title,
          description: eventDetails.description,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al actualizar evento en Google: ${err}`);
      // Si el evento no existe, se crea uno nuevo
      if (response.status === 404) {
        throw new Error('EVENT_NOT_FOUND');
      }
      throw new Error('No se pudo actualizar el evento en Google Calendar.');
    }
  }

  /**
   * Elimina un evento de Google Calendar.
   */
  async deleteEvent(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    externalEventId: string,
  ): Promise<void> {
    const token = await this.getValidToken(integration, integrationRepo);
    const calendarId = integration.calendarId || 'primary';

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events/${externalEventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok && response.status !== 404 && response.status !== 410) {
      const err = await response.text();
      this.logger.error(`Error al eliminar evento en Google: ${err}`);
      throw new Error('No se pudo eliminar el evento en Google Calendar.');
    }
  }

  /**
   * Registra una suscripción de webhook (Watch) en Google Calendar.
   */
  async createWebhookSubscription(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    subscriptionId: string,
  ): Promise<{ resourceId: string; expiration: Date }> {
    const token = await this.getValidToken(integration, integrationRepo);
    const calendarId = integration.calendarId || 'primary';
    const serverUrl = this.configService.get<string>('API_URL') || this.configService.get<string>('PUBLIC_SERVER_URL');
    const webhookAddress = `${serverUrl!.replace(/\/$/, '')}/api/calendar-webhooks/google`;

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: subscriptionId,
          type: 'web_hook',
          address: webhookAddress,
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al suscribir webhook en Google: ${err}`);
      throw new Error('No se pudo activar el webhook en Google Calendar.');
    }

    const data = await response.json();
    return {
      resourceId: data.resourceId,
      expiration: new Date(parseInt(data.expiration, 10)),
    };
  }

  /**
   * Elimina una suscripción de webhook activa.
   */
  async stopWebhookSubscription(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    subscriptionId: string,
    resourceId: string,
  ): Promise<void> {
    const token = await this.getValidToken(integration, integrationRepo);
    const response = await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: subscriptionId,
        resourceId,
      }),
    });

    if (!response.ok && response.status !== 404) {
      const err = await response.text();
      this.logger.error(`Error al detener canal de webhook en Google: ${err}`);
    }
  }

  /**
   * Obtiene la lista de eventos modificados en Google Calendar.
   */
  async getSyncChanges(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
  ): Promise<{ items: any[]; nextSyncToken: string | null }> {
    const token = await this.getValidToken(integration, integrationRepo);
    const calendarId = integration.calendarId || 'primary';

    const params: Record<string, string> = {
      maxResults: '250',
    };

    if (integration.syncToken) {
      params.syncToken = integration.syncToken;
    }

    let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events?${new URLSearchParams(params).toString()}`;

    let response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Si el syncToken expiró (410), hacemos sincronización completa desde hace un día
    if (response.status === 410) {
      this.logger.warn('Google Calendar syncToken expirado. Iniciando sincronización completa...');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const fullParams = new URLSearchParams({
        maxResults: '250',
        timeMin: yesterday.toISOString(),
      });
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events?${fullParams.toString()}`;
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Error al obtener eventos de Google: ${err}`);
      throw new Error('No se pudieron descargar los cambios de Google.');
    }

    const data = await response.json();
    return {
      items: data.items || [],
      nextSyncToken: data.nextSyncToken || null,
    };
  }
}
