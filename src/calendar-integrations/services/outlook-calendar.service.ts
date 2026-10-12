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
        changeType: 'created,updated,deleted',
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
   * Renueva una suscripción de webhook activa o crea una nueva si expiró.
   */
  async renewWebhookSubscription(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
  ): Promise<{ subscriptionId: string; expiration: Date }> {
    const token = await this.getValidToken(integration, integrationRepo);
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + 4000); // ~2.8 días

    if (integration.webhookSubscriptionId) {
      try {
        const response = await fetch(
          `https://graph.microsoft.com/v1.0/subscriptions/${integration.webhookSubscriptionId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              expirationDateTime: expiration.toISOString(),
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const newExp = new Date(data.expirationDateTime);
          integration.webhookExpiration = newExp;
          await integrationRepo.save(integration);
          this.logger.log(`Webhook de Outlook renovado exitosamente para usuario ${integration.userId}. Expira: ${newExp.toISOString()}`);
          return { subscriptionId: integration.webhookSubscriptionId, expiration: newExp };
        }
        this.logger.warn(`No se pudo renovar suscripción previa (${response.status}). Creando nueva suscripción...`);
      } catch (err) {
        this.logger.warn(`Fallo al intentar PATCH en suscripción: ${err.message}. Recreando...`);
      }
    }

    // Si no había suscripción previa o falló el PATCH (ej: 404 por expiración), crear una nueva
    const newSubId = crypto.randomUUID();
    const created = await this.createWebhookSubscription(integration, integrationRepo, newSubId);
    integration.webhookSubscriptionId = newSubId;
    integration.webhookExpiration = created.expiration;
    await integrationRepo.save(integration);
    this.logger.log(`Nueva suscripción de webhook creada para usuario ${integration.userId}. ID: ${newSubId}`);
    return { subscriptionId: newSubId, expiration: created.expiration };
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
   * Sincroniza cambios usando Graph API Delta queries con ventana temporal deslizante y paginación completa.
   */
  async getSyncChanges(
    integration: UserCalendarIntegration,
    integrationRepo: Repository<UserCalendarIntegration>,
    forceFreshWindow = false,
  ): Promise<{ items: any[]; nextSyncToken: string | null }> {
    const token = await this.getValidToken(integration, integrationRepo);

    // Parsear estado previo del delta token si existe
    let state: { d: string; t: number; wStart: string; wEnd: string } | null = null;
    if (integration.syncToken && !forceFreshWindow) {
      try {
        if (integration.syncToken.startsWith('{')) {
          state = JSON.parse(integration.syncToken);
        }
      } catch {
        state = null;
      }
    }

    // Determinar si necesitamos abrir una ventana delta fresca:
    // 1. Solicitud explícita (forceFreshWindow)
    // 2. No hay estado previo (o es el formato antiguo de URL simple)
    // 3. El delta token tiene más de 24 horas (para mantener actualizada la ventana móvil de citas)
    // 4. El fin de la ventana monitoreada está a menos de 7 días del presente
    const now = Date.now();
    const isStateExpired = state ? (now - state.t > 24 * 60 * 60 * 1000) : true;
    const isWindowEndingSoon = state?.wEnd ? (new Date(state.wEnd).getTime() - now < 7 * 24 * 60 * 60 * 1000) : false;
    const needsFreshWindow = forceFreshWindow || !state || isStateExpired || isWindowEndingSoon;

    let url: string;
    let windowStartStr = state?.wStart;
    let windowEndStr = state?.wEnd;

    if (needsFreshWindow) {
      const start = new Date();
      start.setDate(start.getDate() - 30); // 30 días al pasado
      const end = new Date();
      end.setDate(end.getDate() + 60);    // 60 días al futuro

      windowStartStr = start.toISOString();
      windowEndStr = end.toISOString();
      url = `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${windowStartStr}&endDateTime=${windowEndStr}`;
      this.logger.log(`Iniciando ventana delta fresca de Outlook [${windowStartStr} - ${windowEndStr}] para usuario ${integration.userId}`);
    } else {
      url = state!.d;
    }

    const items: any[] = [];
    let nextUrl: string | null = url;
    let finalDeltaLink: string | null = null;
    let pageCount = 0;

    while (nextUrl && pageCount < 30) {
      pageCount++;
      const response: any = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Prefer: 'odata.maxpagesize=50',
        },
      });

      // Si el delta token falló o expiró (ej: 410 Gone / 400 Bad Request), reintentar una sincronización fresca
      if (!response.ok) {
        if (!needsFreshWindow) {
          this.logger.warn(`Delta token de Outlook inválido (${response.status}). Reiniciando con ventana fresca...`);
          return this.getSyncChanges(integration, integrationRepo, true);
        }
        const err = await response.text();
        this.logger.error(`Error en delta query de Outlook: ${err}`);
        throw new Error('No se pudieron descargar los cambios de Outlook.');
      }

      const data: any = await response.json();
      if (Array.isArray(data.value)) {
        items.push(...data.value);
      }

      // Manejar paginación (@odata.nextLink) hasta obtener el @odata.deltaLink en la última página
      if (data['@odata.nextLink']) {
        nextUrl = data['@odata.nextLink'];
      } else {
        finalDeltaLink = data['@odata.deltaLink'] || null;
        nextUrl = null;
      }
    }

    // Codificar el nuevo estado compacto en nextSyncToken
    let nextSyncToken: string | null = null;
    if (finalDeltaLink) {
      nextSyncToken = JSON.stringify({
        d: finalDeltaLink,
        t: Date.now(),
        wStart: windowStartStr || new Date(Date.now() - 30 * 86400000).toISOString(),
        wEnd: windowEndStr || new Date(Date.now() + 60 * 86400000).toISOString(),
      });
    }

    this.logger.log(`Descargados ${items.length} eventos de Outlook (páginas procesadas: ${pageCount}) para usuario ${integration.userId}`);
    return {
      items,
      nextSyncToken,
    };
  }
}
