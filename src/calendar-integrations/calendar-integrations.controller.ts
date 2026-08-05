import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UserCalendarIntegration } from './entities/user-calendar-integration.entity';
import { CalendarWebhookMapping } from './entities/calendar-webhook-mapping.entity';
import { GoogleCalendarService } from './services/google-calendar.service';
import { OutlookCalendarService } from './services/outlook-calendar.service';
import { ICloudCalendarService } from './services/icloud-calendar.service';
import { CalendarSyncCoordinatorService } from './services/calendar-sync-coordinator.service';

@UseGuards(AuthGuard('jwt'))
@Controller('calendar-integrations')
export class CalendarIntegrationsController {
  constructor(
    @InjectRepository(UserCalendarIntegration)
    private readonly integrationRepo: Repository<UserCalendarIntegration>,
    @InjectRepository(CalendarWebhookMapping)
    private readonly webhookMappingRepo: Repository<CalendarWebhookMapping>,
    private readonly googleService: GoogleCalendarService,
    private readonly outlookService: OutlookCalendarService,
    private readonly icloudService: ICloudCalendarService,
    private readonly syncCoordinator: CalendarSyncCoordinatorService,
  ) {}

  /**
   * Obtiene el estado actual de la integración del usuario firmado.
   */
  @Get('status')
  async getStatus(@GetUser() user: User) {

    const integration = await this.integrationRepo.findOne({
      where: { userId: user.id },
    });

    if (!integration) {
      return { connected: false };
    }

    return {
      connected: true,
      provider: integration.provider,
      email: integration.email,
      createdAt: integration.createdAt,
    };
  }

  /**
   * Obtiene la URL de autenticación de OAuth2 para Google o Outlook.
   */
  @Get('auth-url')
  async getAuthUrl(@GetUser() user: User, @Query('provider') provider: string) {
    if (!provider || (provider !== 'google' && provider !== 'outlook')) {
      throw new BadRequestException('Proveedor inválido o no especificado.');
    }

    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const userId = user.id;

    // Codificamos el estado en base64 para transmitirlo al callback OAuth de forma segura
    const statePayload = JSON.stringify({ tenantSchema, userId, provider });
    const state = Buffer.from(statePayload).toString('base64');

    let authUrl = '';
    if (provider === 'google') {
      authUrl = this.googleService.getAuthUrl(state);
    } else {
      authUrl = this.outlookService.getAuthUrl(state);
    }

    return { authUrl };
  }

  /**
   * Conecta una cuenta de iCloud CalDAV.
   */
  @Post('connect-icloud')
  async connectICloud(
    @GetUser() user: User,
    @Body() body: { email: string; appPassword: string },
  ) {
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const { email, appPassword } = body;
    if (!email || !appPassword) {
      throw new BadRequestException('Se requiere email y contraseña de aplicación.');
    }

    try {
      // 1. Descubrir la ruta de calendarios
      const homeUrl = await this.icloudService.discoverCalendarHome(email, appPassword);
      
      // 2. Obtener lista de calendarios y elegir el primero
      const calendars = await this.icloudService.getCalendarsList(email, appPassword, homeUrl);
      if (calendars.length === 0) {
        throw new BadRequestException('No se encontraron calendarios válidos en la cuenta de iCloud.');
      }
      
      const defaultCalendar = calendars[0].id;

      // 3. Encriptar contraseña y guardar configuración
      const encryptedPassword = this.icloudService.encryptPassword(appPassword);

      // Eliminar integración previa si existe
      await this.integrationRepo.delete({ userId: user.id });

      const integration = this.integrationRepo.create({
        userId: user.id,
        provider: 'icloud',
        email: email,
        icloudEmail: email,
        icloudPassword: encryptedPassword,
        calendarId: defaultCalendar,
      });

      await this.integrationRepo.save(integration);

      // 4. Iniciar sync inicial en segundo plano
      this.syncCoordinator.syncExternalChangesToCRM(tenantSchema, user.id).catch(() => null);

      return {
        success: true,
        email: email,
      };
    } catch (err) {
      throw new BadRequestException(err.message || 'Error al conectar con iCloud.');
    }
  }

  /**
   * Desconecta la integración del usuario firmado y remueve webhooks/mappings.
   */
  @Delete('disconnect')
  async disconnect(@GetUser() user: User) {
    const integration = await this.integrationRepo.findOne({
      where: { userId: user.id },
    });

    if (!integration) {
      throw new NotFoundException('No existe integración activa para este usuario.');
    }

    // Remover suscripción a webhook si existe (Google o Outlook)
    if (integration.webhookSubscriptionId) {
      try {
        if (integration.provider === 'google') {
          // Para Google necesitamos la clave del recurso que no guardamos, pero intentamos limpiarlo si es posible
          // En caso contrario, expira automáticamente.
        } else if (integration.provider === 'outlook') {
          await this.outlookService.stopWebhookSubscription(
            integration,
            this.integrationRepo,
            integration.webhookSubscriptionId,
          );
        }
      } catch (err) {
        // Continuamos incluso si falla la eliminación remota
      }

      // Eliminar de los mappings globales
      await this.webhookMappingRepo.delete({ subscriptionId: integration.webhookSubscriptionId });
    }

    await this.integrationRepo.remove(integration);
    return { success: true };
  }
}
