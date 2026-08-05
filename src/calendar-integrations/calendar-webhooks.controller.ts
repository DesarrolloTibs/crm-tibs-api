import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UserCalendarIntegration } from './entities/user-calendar-integration.entity';
import { CalendarWebhookMapping } from './entities/calendar-webhook-mapping.entity';
import { GoogleCalendarService } from './services/google-calendar.service';
import { OutlookCalendarService } from './services/outlook-calendar.service';
import { CalendarSyncCoordinatorService } from './services/calendar-sync-coordinator.service';

@Controller('calendar-webhooks')
export class CalendarWebhooksController {
  private readonly logger = new Logger('CalendarWebhooksController');

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CalendarWebhookMapping)
    private readonly webhookMappingRepo: Repository<CalendarWebhookMapping>,
    private readonly googleService: GoogleCalendarService,
    private readonly outlookService: OutlookCalendarService,
    private readonly syncCoordinator: CalendarSyncCoordinatorService,
  ) {}

  /**
   * Endpoint receptor de redireccionamiento OAuth2 para Google y Outlook.
   */
  @Get('oauth-callback')
  async oauthCallback(
    @Query() query: any,
    @Res() res: any,
  ) {
    const { code, state } = query;
    const frontendUrl = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173').replace(/\/$/, '');

    if (!code || !state) {
      this.logger.error(`Callback OAuth2 invocado sin código o estado. Query recibida: ${JSON.stringify(query)}`);
      return res.redirect(`${frontendUrl}/settings?calendar_sync=error`);
    }

    try {
      // 1. Decodificar estado
      const statePayload = Buffer.from(state, 'base64').toString('utf8');
      const { tenantSchema, userId } = JSON.parse(statePayload);

      if (!tenantSchema || !userId) {
        throw new Error('Estado de OAuth2 inválido.');
      }

      // Determinar si es Google o Outlook analizando las variables de entorno o el flujo
      // Para saber el proveedor, podemos usar un identificador en el state, o intentar inferir.
      // Modificamos el state al generarse para incluir el provider: { tenantSchema, userId, provider }
      // Pero dado que Google redirect URI es diferente a Outlook, podemos inferirlo por la URL o guardar el proveedor en el state.
      // Vamos a asumir que podemos guardar el proveedor en el state. Actualizamos la estructura:
      // statePayload = { tenantSchema, userId, provider }
      const { provider } = JSON.parse(statePayload);
      if (!provider) {
        throw new Error('Proveedor no identificado en el estado de OAuth2.');
      }

      // 2. Ejecutar lógica en el esquema del inquilino
      await TenantContextService.run({ tenantSchema, userId }, async () => {
        const queryRunner = this.webhookMappingRepo.manager.connection.createQueryRunner();
        const integrationRepo = queryRunner.manager.getRepository(UserCalendarIntegration);

        let oauthResult;
        if (provider === 'google') {
          oauthResult = await this.googleService.exchangeCode(code);
        } else {
          oauthResult = await this.outlookService.exchangeCode(code);
        }

        // Eliminar conexión anterior si existe
        await integrationRepo.delete({ userId });

        const integration = integrationRepo.create({
          userId,
          provider,
          email: oauthResult.email,
          accessToken: oauthResult.accessToken,
          refreshToken: oauthResult.refreshToken,
          expiresAt: oauthResult.expiresAt,
        });

        const savedIntegration = await integrationRepo.save(integration);

        // 3. Crear suscripción de Webhook para sincronización en tiempo real
        const subscriptionId = crypto.randomUUID();
        try {
          if (provider === 'google') {
            const googleSub = await this.googleService.createWebhookSubscription(
              savedIntegration,
              integrationRepo,
              subscriptionId,
            );
            savedIntegration.webhookSubscriptionId = subscriptionId;
            savedIntegration.webhookExpiration = googleSub.expiration;
            await integrationRepo.save(savedIntegration);

            // Registrar mapping global
            await this.webhookMappingRepo.save({
              subscriptionId,
              tenantSchema,
              userId,
              provider: 'google',
              expiresAt: googleSub.expiration,
            });
          } else {
            const outlookSub = await this.outlookService.createWebhookSubscription(
              savedIntegration,
              integrationRepo,
              subscriptionId,
            );
            // El ID de suscripción de Outlook lo devuelve Microsoft, usamos ese
            savedIntegration.webhookSubscriptionId = subscriptionId;
            savedIntegration.webhookExpiration = outlookSub.expiration;
            await integrationRepo.save(savedIntegration);

            // En Outlook, la suscripción real responde con un ID propio de Microsoft Graph
            // Sin embargo, para simplificar lo registramos utilizando el subscriptionId interno que enviamos en clientState.
            await this.webhookMappingRepo.save({
              subscriptionId,
              tenantSchema,
              userId,
              provider: 'outlook',
              expiresAt: outlookSub.expiration,
            });
          }
        } catch (subErr) {
          this.logger.error(`No se pudo registrar la suscripción de webhook para ${provider}: ${subErr.message}`);
          // Continuamos la conexión aunque falle el push webhook en tiempo real (seguirá habiendo sync en acciones locales)
        }

        // 4. Disparar sincronización inicial en segundo plano
        this.syncCoordinator.syncExternalChangesToCRM(tenantSchema, userId).catch(() => null);
      });

      return res.redirect(`${frontendUrl}/settings?calendar_sync=success`);
    } catch (err) {
      this.logger.error(`Error en callback de OAuth2: ${err.message}`, err.stack);
      return res.redirect(`${frontendUrl}/settings?calendar_sync=error`);
    }
  }

  /**
   * Endpoint receptor de notificaciones Push de Google Calendar.
   */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async handleGoogleWebhook(
    @Headers('x-goog-channel-id') channelId: string,
    @Headers('x-goog-resource-state') state: string,
  ) {
    if (!channelId || state === 'sync') {
      return; // Omitir notificaciones de sincronización inicial
    }

    this.logger.log(`Recibido webhook de Google para canal: ${channelId}`);
    
    // Buscar mapping global en public
    const mapping = await this.webhookMappingRepo.findOne({
      where: { subscriptionId: channelId, provider: 'google' },
    });

    if (!mapping) {
      this.logger.warn(`No se encontró mapping global para el canal de Google: ${channelId}`);
      return;
    }

    // Disparar sincronización asíncrona
    this.syncCoordinator.syncExternalChangesToCRM(mapping.tenantSchema, mapping.userId).catch(() => null);
  }

  /**
   * Endpoint receptor de Change Notifications de Microsoft Graph (Outlook).
   */
  @Post('outlook')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleOutlookWebhook(
    @Query('validationToken') validationToken: string,
    @Body() payload: any,
    @Res() res: any,
  ) {
    // 1. Si Microsoft está validando la URL del webhook, respondemos con el token en texto plano
    if (validationToken) {
      this.logger.log('Validando endpoint de webhook con Microsoft Graph.');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(HttpStatus.OK).send(validationToken);
    }

    // 2. Procesar notificaciones de cambios
    if (payload && payload.value) {
      for (const notification of payload.value) {
        const clientState = notification.clientState; // En Outlook, nos devuelve el subscriptionId interno que enviamos
        if (!clientState) continue;

        this.logger.log(`Recibido webhook de Outlook para clientState: ${clientState}`);

        const mapping = await this.webhookMappingRepo.findOne({
          where: { subscriptionId: clientState, provider: 'outlook' },
        });

        if (mapping) {
          this.syncCoordinator.syncExternalChangesToCRM(mapping.tenantSchema, mapping.userId).catch(() => null);
        }
      }
    }

    return res.status(HttpStatus.ACCEPTED).send();
  }
}
