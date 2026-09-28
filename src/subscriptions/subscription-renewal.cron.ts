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

        // 2. Congelar y cerrar el ciclo de facturación activo expirado
        try {
          const activeCycles = await this.dataSource.query(
            `SELECT id, plan_id, tokens_limit, allow_extra, start_date, end_date 
             FROM public.tenant_billing_cycles 
             WHERE tenant_id = $1 AND status = 'active' 
             ORDER BY start_date DESC 
             LIMIT 1`,
            [tenantIdStr]
          );

          if (activeCycles.length > 0) {
            const activeCycle = activeCycles[0];
            let tokensUsed = 0;
            let tokensExtraUsed = 0;
            let tokensCourtesyUsed = 0;

            try {
              const statsRes = await this.dataSource.query(
                `SELECT 
                   COALESCE(SUM(CASE WHEN is_extra = false THEN total_tokens ELSE 0 END), 0) AS base_total,
                   COALESCE(SUM(CASE WHEN is_extra = true THEN total_tokens ELSE 0 END), 0) AS extra_total
                 FROM "${schemaName}".transaction_history 
                 WHERE fecha_procesamiento >= $1 AND fecha_procesamiento < $2`,
                [activeCycle.start_date, currentRenewalDate]
              );
              const baseTotal = parseInt(statsRes[0]?.base_total, 10) || 0;
              const extraTotal = parseInt(statsRes[0]?.extra_total, 10) || 0;
              const limit = parseInt(activeCycle.tokens_limit, 10) || 0;
              tokensUsed = Math.min(baseTotal, limit);
              tokensCourtesyUsed = Math.max(0, baseTotal - limit) + Math.max(0, extraTotal - limit);
              tokensExtraUsed = Math.min(extraTotal, limit);
            } catch (e: any) {
              this.logger.warn(`No se pudo calcular consumo final para ciclo ${activeCycle.id}: ${e.message}`);
            }

            await this.dataSource.query(
              `UPDATE public.tenant_billing_cycles 
               SET status = 'closed', closed_at = NOW(), close_reason = 'renewal_cron',
                   tokens_used_at_close = $1, tokens_extra_used_at_close = $2, tokens_courtesy_at_close = $3 
               WHERE id = $4`,
              [tokensUsed, activeCycle.allow_extra ? tokensExtraUsed : 0, tokensCourtesyUsed, activeCycle.id]
            );
          }
        } catch (e: any) {
          this.logger.warn(`Error al cerrar ciclo previo para tenant ${tenantIdStr}: ${e.message}`);
        }

        // 3. Verificar si hay un período pendiente en public.tenant_renewal_queue
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

          // Ejecutar en transacción atómica la actualización del tenant, la remoción de la cola y el nuevo ciclo
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

            // Obtener especificaciones del nuevo plan asignado
            const planRes = await manager.query(
              `SELECT plan_name, tokens_limit, price FROM public.plans WHERE plan_id = $1`,
              [newPlanId]
            );
            const planName = planRes[0]?.plan_name || 'Plan Pro';
            const tokensLimit = planRes[0]?.tokens_limit ? parseInt(planRes[0].tokens_limit, 10) : 300000;
            const price = planRes[0]?.price ? parseFloat(planRes[0].price) : 0;

            await manager.query(
              `INSERT INTO public.tenant_billing_cycles (
                tenant_id, plan_id, plan_name, tokens_limit, price, billing_period_months,
                start_date, end_date, status, allow_extra, tokens_used_at_close, tokens_extra_used_at_close, tokens_courtesy_at_close
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, 0, 0, 0)`,
              [tenantIdStr, newPlanId, planName, tokensLimit, price, months, baseDate, newRenewalDate, Boolean(tenant.allow_extra)]
            );
          });

          this.logger.log(
            `Organización '${schemaName}' (ID ${tenant.id}) renovada exitosamente → Plan ID ${newPlanId}. Nuevo ciclo de facturación creado hasta: ${newRenewalDate.toISOString()}`
          );
        } else {
          // 4. Cola vacía: marcar suscripción como inactiva/expirada
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
