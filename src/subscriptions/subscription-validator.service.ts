import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface CheckSubscriptionResult {
  is_extra: boolean;
}

export interface SubscriptionErrorPayload {
  code: 'PLAN_NOT_ASSIGNED' | 'SUBSCRIPTION_EXPIRED' | 'TOKENS_LIMIT_EXCEEDED';
  message: string;
  tokens_used?: number;
  tokens_limit?: number;
  next_renewal_date?: Date | null;
}

@Injectable()
export class SubscriptionValidatorService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Obtiene la información del plan del tenant desde public.tenants y public.plans
   */
  async getTenantPlanInfo(tenantIdOrSchema: string) {
    const rows = await this.dataSource.query(
      `SELECT 
         t.id, t.name, t.schema_name, t.plan_id, t.next_renewal_date, t.is_active, t.allow_extra,
         p.plan_name, p.price, p.tokens_limit, p.billing_period_months, p.blnstatus
       FROM public.tenants t
       LEFT JOIN public.plans p ON t.plan_id = p.plan_id
       WHERE t.id::text = $1 OR t.schema_name = $1`,
      [tenantIdOrSchema]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      tenant_id: row.id,
      tenant_name: row.name,
      schema_name: row.schema_name,
      plan_id: row.plan_id,
      next_renewal_date: row.next_renewal_date ? new Date(row.next_renewal_date) : null,
      is_active: Boolean(row.is_active),
      allow_extra: Boolean(row.allow_extra),
      plan_name: row.plan_name,
      price: row.price ? parseFloat(row.price) : 0,
      tokens_limit: row.tokens_limit ? parseInt(row.tokens_limit, 10) : 0,
      billing_period_months: row.billing_period_months ? parseInt(row.billing_period_months, 10) : 1,
      blnstatus: Boolean(row.blnstatus),
    };
  }

  /**
   * Calcula los tokens consumidos en el período de facturación activo
   * del esquema dado donde is_extra = FALSE.
   */
  async getTokensUsedInPeriod(schemaName: string, periodStart: Date, periodEnd: Date): Promise<number> {
    const result = await this.dataSource.query(
      `SELECT COALESCE(SUM(total_tokens), 0) AS total 
       FROM "${schemaName}".transaction_history 
       WHERE is_extra = false 
         AND fecha_procesamiento >= $1 
         AND fecha_procesamiento <= $2`,
      [periodStart, periodEnd]
    );

    return result[0]?.total ? parseInt(result[0].total, 10) : 0;
  }

  /**
   * Valida la suscripción y los límites de consumo por tokens antes de procesar llamadas a modelos / LLMs.
   */
  async checkSubscriptionLimits(
    schemaName: string,
    estimatedTokens: number = 0
  ): Promise<CheckSubscriptionResult> {
    const tenantInfo = await this.getTenantPlanInfo(schemaName);

    // a) Validar que el tenant tenga plan asignado
    if (!tenantInfo || !tenantInfo.plan_id) {
      throw new HttpException(
        {
          code: 'PLAN_NOT_ASSIGNED',
          message: 'La organización no tiene un plan de suscripción asignado.',
        } as SubscriptionErrorPayload,
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    // Validar vigor de next_renewal_date y estado is_active
    const now = new Date();
    const nextRenewal = tenantInfo.next_renewal_date;

    if (!tenantInfo.is_active || (nextRenewal && now > nextRenewal)) {
      throw new HttpException(
        {
          code: 'SUBSCRIPTION_EXPIRED',
          message: `La suscripción expiró el ${nextRenewal?.toISOString() || 'N/A'}. Por favor, renueve su plan.`,
          next_renewal_date: nextRenewal,
        } as SubscriptionErrorPayload,
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    // b) Calcular fecha de inicio del período de facturación actual [next_renewal_date - billing_period_months, next_renewal_date]
    const months = tenantInfo.billing_period_months;
    const periodStart = new Date(nextRenewal!);
    periodStart.setMonth(periodStart.getMonth() - months);
    const periodEnd = nextRenewal!;

    // Sumar consumo actual
    const tokensUsed = await this.getTokensUsedInPeriod(schemaName, periodStart, periodEnd);
    const tokensLimit = tenantInfo.tokens_limit;

    // c) Verificar límite de tokens
    if (tokensUsed + estimatedTokens <= tokensLimit) {
      return { is_extra: false };
    }

    // Excede límite: verificar si allow_extra == True
    if (tenantInfo.allow_extra) {
      return { is_extra: true };
    }

    // Excede límite y allow_extra == False -> Rechazar con HTTP 402 TOKENS_LIMIT_EXCEEDED
    throw new HttpException(
      {
        code: 'TOKENS_LIMIT_EXCEEDED',
        message: `Ha alcanzado el límite de tokens de su plan (${tokensLimit.toLocaleString()} tokens). Consumidos: ${tokensUsed.toLocaleString()}.`,
        tokens_used: tokensUsed,
        tokens_limit: tokensLimit,
        next_renewal_date: nextRenewal,
      } as SubscriptionErrorPayload,
      HttpStatus.PAYMENT_REQUIRED
    );
  }

  /**
   * Registra una transacción de consumo de tokens en la tabla transaction_history del tenant
   */
  async recordConsumption(
    schemaName: string,
    promptTokens: number,
    completionTokens: number,
    totalTokens: number,
    isExtra: boolean = false,
    actionName?: string
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO "${schemaName}".transaction_history 
       (prompt_tokens, completion_tokens, total_tokens, fecha_procesamiento, is_extra, action_name) 
       VALUES ($1, $2, $3, now(), $4, $5)`,
      [promptTokens, completionTokens, totalTokens, isExtra, actionName || null]
    );
  }
}
