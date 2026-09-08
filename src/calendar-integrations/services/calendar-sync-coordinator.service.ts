import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { UserCalendarIntegration } from '../entities/user-calendar-integration.entity';
import { GoogleCalendarService } from './google-calendar.service';
import { OutlookCalendarService } from './outlook-calendar.service';
import { Activity } from '../../activities/entities/activity.entity';
import { Client, ClientCategory } from '../../clients/entities/client.entity';

@Injectable()
export class CalendarSyncCoordinatorService {
  private readonly logger = new Logger('CalendarSyncCoordinator');
  private isSyncing = new Set<string>(); // Evita colisiones de ejecuciones concurrentes
  private lastSyncTimeMap = new Map<string, number>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly googleService: GoogleCalendarService,
    private readonly outlookService: OutlookCalendarService,
  ) {}

  /**
   * Obtiene o crea el cliente comodín en el esquema del tenant actual.
   */
  private async getOrCreatePlaceholderClient(clientRepo: Repository<Client>): Promise<Client> {
    let client = await clientRepo.findOne({ where: { correo: 'calendar-fallback@crm.com' } });
    if (!client) {
      client = clientRepo.create({
        nombre: 'Contacto',
        apellido: 'Calendario Externo',
        correo: 'calendar-fallback@crm.com',
        empresa: 'Calendario Sincronizado',
        category: ClientCategory.LEAD,
        estatus: true,
      });
      client = await clientRepo.save(client);
      this.logger.log(`Cliente comodín creado en el tenant actual.`);
    }
    return client;
  }

  /**
   * Intenta asociar un evento externo a un cliente existente buscando su email entre los asistentes.
   */
  private async findClientByEmails(clientRepo: Repository<Client>, emails: string[]): Promise<Client | null> {
    if (!emails || emails.length === 0) return null;
    for (const email of emails) {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || cleanEmail === 'calendar-fallback@crm.com') continue;
      const client = await clientRepo.findOne({ where: { correo: cleanEmail } });
      if (client) {
        return client;
      }
    }
    return null;
  }

  /**
   * Escucha la creación de actividades en el CRM y las propaga al calendario externo.
   */
  @OnEvent('activity.created')
  async handleActivityCreated(payload: { activity: Activity; tenantSchema: string }) {
    const { activity, tenantSchema } = payload;
    if (!activity.userId) return;

    await TenantContextService.run({ tenantSchema }, async () => {
      try {
        const integrationRepo = this.dataSource.getRepository(UserCalendarIntegration);
        const activityRepo = this.dataSource.getRepository(Activity);

        const integration = await integrationRepo.findOne({ where: { userId: activity.userId } });
        if (!integration) return;

        this.logger.log(`Sincronizando nueva actividad al calendario externo (${integration.provider}) para usuario: ${activity.userId}`);

        let externalId = '';
        const title = `[CRM] ${activity.activity}`;
        const description = `Actividad generada desde el CRM.\nOportunidad: ${activity.opportunity?.nombre_proyecto || 'N/A'}\nAsociada a: ${activity.client?.nombre || 'N/A'}`;

        if (integration.provider === 'google') {
          externalId = await this.googleService.createEvent(integration, integrationRepo, {
            title,
            description,
            date: activity.date,
          });
        } else if (integration.provider === 'outlook') {
          externalId = await this.outlookService.createEvent(integration, integrationRepo, {
            title,
            description,
            date: activity.date,
          });
        }

        if (externalId) {
          await activityRepo.update(activity.id, {
            externalEventId: externalId,
            externalProvider: integration.provider,
            externalLastSyncedAt: new Date(),
          });
        }
      } catch (err) {
        this.logger.error(`Error al sincronizar creación de actividad al calendario externo: ${err.message}`, err.stack);
      }
    });
  }

  /**
   * Escucha la actualización de actividades en el CRM y las actualiza externamente.
   */
  @OnEvent('activity.updated')
  async handleActivityUpdated(payload: { activity: Activity; tenantSchema: string }) {
    const { activity, tenantSchema } = payload;
    if (!activity.userId || !activity.externalEventId || !activity.externalProvider) return;

    // Si la actualización fue provocada por un webhook externo, no volvemos a sincronizar (evita bucles)
    const timeSinceLastSync = Date.now() - new Date(activity.externalLastSyncedAt || 0).getTime();
    if (timeSinceLastSync < 3000) {
      return;
    }

    await TenantContextService.run({ tenantSchema }, async () => {
      try {
        const integrationRepo = this.dataSource.getRepository(UserCalendarIntegration);
        const activityRepo = this.dataSource.getRepository(Activity);

        const integration = await integrationRepo.findOne({ where: { userId: activity.userId } });
        if (!integration) return;

        this.logger.log(`Sincronizando actualización de actividad al calendario externo (${integration.provider})`);

        const title = `[CRM] ${activity.activity}`;
        const description = `Actividad generada desde el CRM.\nOportunidad: ${activity.opportunity?.nombre_proyecto || 'N/A'}`;

        try {
          if (integration.provider === 'google') {
            await this.googleService.updateEvent(integration, integrationRepo, activity.externalEventId!, {
              title,
              description,
              date: activity.date,
            });
          } else if (integration.provider === 'outlook') {
            await this.outlookService.updateEvent(integration, integrationRepo, activity.externalEventId!, {
              title,
              description,
              date: activity.date,
            });
          }
          
          await activityRepo.update(activity.id, {
            externalLastSyncedAt: new Date(),
          });
        } catch (err) {
          if (err.message === 'EVENT_NOT_FOUND') {
            // El evento fue borrado externamente; lo volvemos a crear
            this.logger.warn(`Evento no encontrado en el calendario externo. Volviendo a crear...`);
            let newExternalId = '';
            if (integration.provider === 'google') {
              newExternalId = await this.googleService.createEvent(integration, integrationRepo, {
                title,
                description,
                date: activity.date,
              });
            } else if (integration.provider === 'outlook') {
              newExternalId = await this.outlookService.createEvent(integration, integrationRepo, {
                title,
                description,
                date: activity.date,
              });
            }
            if (newExternalId) {
              await activityRepo.update(activity.id, {
                externalEventId: newExternalId,
                externalLastSyncedAt: new Date(),
              });
            }
          } else {
            throw err;
          }
        }
      } catch (err) {
        this.logger.error(`Error al sincronizar actualización de actividad: ${err.message}`);
      }
    });
  }

  /**
   * Escucha la eliminación de actividades y las remueve externamente.
   */
  @OnEvent('activity.deleted')
  async handleActivityDeleted(payload: { activityId: string; externalEventId?: string; externalProvider?: string; userId: string; tenantSchema: string }) {
    const { externalEventId, externalProvider, userId, tenantSchema } = payload;
    if (!externalEventId || !externalProvider || !userId) return;

    await TenantContextService.run({ tenantSchema }, async () => {
      try {
        const integrationRepo = this.dataSource.getRepository(UserCalendarIntegration);

        const integration = await integrationRepo.findOne({ where: { userId } });
        if (!integration) return;

        this.logger.log(`Eliminando evento en el calendario externo (${integration.provider})`);

        if (integration.provider === 'google') {
          await this.googleService.deleteEvent(integration, integrationRepo, externalEventId);
        } else if (integration.provider === 'outlook') {
          await this.outlookService.deleteEvent(integration, integrationRepo, externalEventId);
        }
      } catch (err) {
        this.logger.error(`Error al eliminar evento en calendario externo: ${err.message}`);
      }
    });
  }

  /**
   * Sincroniza cambios desde proveedores externos hacia el CRM (Google/Outlook).
   */
  async syncExternalChangesToCRM(tenantSchema: string, userId: string, force = false): Promise<void> {
    const lockKey = `${tenantSchema}:${userId}`;
    if (this.isSyncing.has(lockKey)) return;

    if (!force) {
      const now = Date.now();
      const lastSync = this.lastSyncTimeMap.get(lockKey) || 0;
      if (now - lastSync < 30000) {
        return; // Skip if synced in the last 60 seconds
      }
      this.lastSyncTimeMap.set(lockKey, now);
    }

    this.isSyncing.add(lockKey);

    await TenantContextService.run({ tenantSchema, userId }, async () => {
      try {
        const integrationRepo = this.dataSource.getRepository(UserCalendarIntegration);
        const activityRepo = this.dataSource.getRepository(Activity);
        const clientRepo = this.dataSource.getRepository(Client);

        const integration = await integrationRepo.findOne({ where: { userId } });
        if (!integration) return;

        this.logger.log(`Iniciando sync de cambios desde ${integration.provider} hacia CRM para usuario: ${userId}`);

        let items: any[] = [];
        let nextSyncToken: string | null = null;

        if (integration.provider === 'google') {
          const res = await this.googleService.getSyncChanges(integration, integrationRepo);
          items = res.items;
          nextSyncToken = res.nextSyncToken;
        } else if (integration.provider === 'outlook') {
          const res = await this.outlookService.getSyncChanges(integration, integrationRepo);
          items = res.items;
          nextSyncToken = res.nextSyncToken;
        }

        for (const item of items) {
          const extId = item.id || item.uid;
          const status = item.status || item.showAs; // 'cancelled' o similar indica borrado
          const isDeleted = status === 'cancelled' || item.isCancelled === true;

          // Buscar si la actividad ya está mapeada
          const existingActivity = await activityRepo.findOne({ where: { externalEventId: extId } });

          if (isDeleted) {
            if (existingActivity) {
              this.logger.log(`Eliminando actividad ${existingActivity.id} debido a eliminación en el calendario externo.`);
              await activityRepo.delete(existingActivity.id);
            }
            continue;
          }

          // Extraer campos del evento externo
          const summary = item.summary || item.subject || 'Actividad Sincronizada';
          const description = item.description || (item.body ? item.body.content : '') || '';
          
          let eventDate: Date | null = null;
          if (item.start) {
            const rawStart = item.start.dateTime || item.start;
            eventDate = rawStart ? new Date(rawStart) : null;
          }

          if (!eventDate || isNaN(eventDate.getTime())) {
            continue;
          }

          if (existingActivity) {
            // Actualizar actividad existente si hay diferencias significativas
            const cleanSummary = summary.replace(/^\[CRM\]\s*/i, '');
            if (existingActivity.activity !== cleanSummary || new Date(existingActivity.date).getTime() !== eventDate.getTime()) {
              this.logger.log(`Actualizando actividad ${existingActivity.id} en base a cambios externos.`);
              await activityRepo.update(existingActivity.id, {
                activity: cleanSummary,
                date: eventDate,
                externalLastSyncedAt: new Date(),
              });
            }
          } else {
            // No existe la actividad en el CRM: la creamos (Smart Match + Fallback)
            const cleanSummary = summary.replace(/^\[CRM\]\s*/i, '');
            
            // Recopilar correos de los asistentes
            const attendeeEmails: string[] = [];
            if (item.attendees) {
              for (const att of item.attendees) {
                const mail = att.email || (att.emailAddress ? att.emailAddress.address : null);
                if (mail) attendeeEmails.push(mail);
              }
            }

            // Smart Match
            let targetClient = await this.findClientByEmails(clientRepo, attendeeEmails);
            if (!targetClient) {
              targetClient = await this.getOrCreatePlaceholderClient(clientRepo);
            }

            this.logger.log(`Creando nueva actividad en el CRM proveniente de calendario externo. Cliente asociado: ${targetClient.correo}`);

            // Buscamos un tipo de actividad genérico o el primero disponible
            const types = await this.dataSource.query(`SELECT id FROM "${tenantSchema}".tbltypeactivities LIMIT 1`);
            const typeActivityId = types && types.length > 0 ? types[0].id : null;

            const newActivity = activityRepo.create({
              activity: cleanSummary,
              date: eventDate,
              userId,
              clientId: targetClient.id,
              typeActivityId,
              externalEventId: extId,
              externalProvider: integration.provider,
              externalLastSyncedAt: new Date(),
              flaghistory: false,
            });

            await activityRepo.save(newActivity);
          }
        }

        // Guardar token de sync si aplica
        if (nextSyncToken && (integration.provider === 'google' || integration.provider === 'outlook')) {
          integration.syncToken = nextSyncToken;
          await integrationRepo.save(integration);
        }
      } catch (err) {
        this.logger.error(`Error durante sync externo a CRM: ${err.message}`, err.stack);
      } finally {
        this.isSyncing.delete(lockKey);
      }
    });
  }
}
