import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { addBillingMonths } from '../common/utils/billing-date.util';

@Injectable()
export class SubscriptionRenewalCron {
  private readonly logger = new Logger(SubscriptionRenewalCron.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Tarea programada que se ejecuta cada hora para renovar suscripciones expiradas.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleSubscriptionRenewals(): Promise<void> {
    this.logger.log('Iniciando tarea programada de renovación de suscripciones...');

    try {
      // 1. Buscar tenants cuya fecha de renovación haya vencido
      const dueTenants = await this.dataSource.query(
        `SELECT id, name, schema_name, plan_id, next_renewal_date, is_active 
         FROM public.tenants 
         WHERE next_renewal_date IS NOT NULL 
           AND next_renewal_date <= NOW()`
      );

      if (dueTenants.length === 0) {
        this.logger.log('No hay organizaciones pendientes de renovación.');
        return;
      }

      this.logger.log(`Se encontraron ${dueTenants.length} organizaciones con fecha de renovación vencida.`);

      for (const tenant of dueTenants) {
        const tenantIdStr = String(tenant.id);
        const schemaName = tenant.schema_name;
        const currentRenewalDate = new Date(tenant.next_renewal_date);

        // 2. Verificar si hay un período pendiente en public.tenant_renewal_queue
        const queueItems = await this.dataSource.query(
          `SELECT id, plan_id, billing_period_months 
           FROM public.tenant_renewal_queue 
           WHERE tenant_id = $1 
           ORDER BY created_at ASC 
           LIMIT 1`,
          [tenantIdStr]
        );

        if (queueItems.length > 0) {
          const queueItem = queueItems[0];
          const months = parseInt(queueItem.billing_period_months, 10) || 1;
          const newPlanId = queueItem.plan_id;

          // Protección contra fechas retroactivas: si la fecha vencida era muy antigua (tenant inactivo por semanas/meses),
          // la base debe ser NOW() para que el nuevo período comience hoy y no en el pasado.
          const now = new Date();
          const baseDate = currentRenewalDate > now ? currentRenewalDate : now;
          const newRenewalDate = addBillingMonths(baseDate, months);

          // Ejecutar en transacción atómica la actualización del tenant y la remoción de la cola
          await this.dataSource.transaction(async (manager) => {
            await manager.query(
              `UPDATE public.tenants 
               SET plan_id = $1, next_renewal_date = $2, is_active = true 
               WHERE id = $3`,
              [newPlanId, newRenewalDate, tenant.id]
            );

            await manager.query(
              `DELETE FROM public.tenant_renewal_queue WHERE id = $1`,
              [queueItem.id]
            );
          });

          this.logger.log(
            `Organización '${schemaName}' (ID ${tenant.id}) renovada exitosamente → Plan ID ${newPlanId}. Nueva fecha de renovación: ${newRenewalDate.toISOString()}`
          );
        } else {
          // 3. Cola vacía: marcar suscripción como inactiva/expirada
          await this.dataSource.query(
            `UPDATE public.tenants SET is_active = false WHERE id = $1`,
            [tenant.id]
          );

          this.logger.warn(
            `Organización '${schemaName}' (ID ${tenant.id}) no tiene renovaciones en cola. Suscripción marcada como INACTIVA.`
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error durante la ejecución de renovación de suscripciones: ${error.message}`, error.stack);
    }
  }
}
