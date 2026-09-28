import { Injectable, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { subtractBillingMonths } from '../common/utils/billing-date.util';

export interface CheckSubscriptionResult {
  is_extra: boolean;
}

export interface TurnTokenAccumulator {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  steps: string[];
  models: string[];
}

export interface ConsumptionAuditContext {
  userId?: string | null;
  userName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  conversationId?: string | null;
  channel?: 'whatsapp' | 'webchat_interno' | 'messenger' | 'instagram' | 'rag' | string | null;
  modelName?: string | null;
  metadata?: Record<string, any> | null;
  turnAccumulator?: TurnTokenAccumulator;
}

export interface SubscriptionErrorPayload {
  code: 'PLAN_NOT_ASSIGNED' | 'SUBSCRIPTION_EXPIRED' | 'TOKENS_LIMIT_EXCEEDED' | 'EXTRA_TOKENS_LIMIT_EXCEEDED';
  message: string;
  tokens_used?: number;
  tokens_limit?: number;
  tokens_extra_used?: number;
  tokens_extra_limit?: number;
  next_renewal_date?: Date | null;
}

@Injectable()
export class SubscriptionValidatorService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.ensureAuditColumnsExist();
  }

  /**
   * Garantiza que todos los esquemas de tenants activos cuenten con las columnas de auditoría en transaction_history
   */
  async ensureAuditColumnsExist(): Promise<void> {
    try {
      const tenants = await this.dataSource.query(`SELECT schema_name FROM public.tenants WHERE is_active = true`);
      for (const t of tenants) {
        const schema = t.schema_name;
        if (!schema || schema === 'public' || !/^[a-z0-9_]+$/.test(schema)) continue;
        await this.dataSource.query(`
          ALTER TABLE "${schema}".transaction_history 
            ADD COLUMN IF NOT EXISTS user_id uuid NULL,
            ADD COLUMN IF NOT EXISTS user_name varchar(255) NULL,
            ADD COLUMN IF NOT EXISTS client_id uuid NULL,
            ADD COLUMN IF NOT EXISTS client_name varchar(255) NULL,
            ADD COLUMN IF NOT EXISTS conversation_id uuid NULL,
            ADD COLUMN IF NOT EXISTS channel varchar(50) NULL,
            ADD COLUMN IF NOT EXISTS model_name varchar(100) NULL,
            ADD COLUMN IF NOT EXISTS metadata jsonb NULL;

          CREATE INDEX IF NOT EXISTS "idx_${schema}_th_fecha" ON "${schema}".transaction_history (fecha_procesamiento DESC);
          CREATE INDEX IF NOT EXISTS "idx_${schema}_th_channel" ON "${schema}".transaction_history (channel);
          CREATE INDEX IF NOT EXISTS "idx_${schema}_th_extra" ON "${schema}".transaction_history (is_extra);
        `).catch(() => {});
      }
    } catch (err: any) {
      // Ignorar fallback si la BD está inicializando
    }
  }

  /**
   * Obtiene la información del plan del tenant desde public.tenants y public.plans
   */
  async getTenantPlanInfo(tenantIdOrSchema: string) {
    const rows = await this.dataSource.query(
      `SELECT 
         t.id, t.name, t.schema_name, t.plan_id, t.next_renewal_date, t.is_active, t.allow_extra, t.logo,
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
      logo: row.logo,
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
   * Obtiene el consumo desglosado en el período de facturación activo respetando la inmutabilidad
   * de las transacciones:
   * - baseTotal (is_extra = false): hasta tokensLimit va a tokensUsed, cualquier excedente es cortesía absorbida (tokensCourtesyUsed)
   * - extraTotal (is_extra = true): consumo extra real facturable (tokensExtraUsed)
   * De este modo, si se activa allow_extra posteriormente, los tokens de cortesía previa no se le cobran al cliente.
   */
  async getTokensConsumptionInPeriod(
    schemaName: string, 
    periodStart: Date, 
    periodEnd: Date,
    tokensLimit: number
  ): Promise<{ tokensUsed: number; tokensExtraUsed: number; tokensCourtesyUsed: number; totalAccumulated: number }> {
    try {
      const result = await this.dataSource.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN is_extra = false THEN total_tokens ELSE 0 END), 0) AS base_total,
           COALESCE(SUM(CASE WHEN is_extra = true THEN total_tokens ELSE 0 END), 0) AS extra_total,
           COALESCE(SUM(total_tokens), 0) AS total_accumulated
         FROM "${schemaName}".transaction_history 
         WHERE fecha_procesamiento >= $1 
           AND fecha_procesamiento < $2`,
        [periodStart, periodEnd]
      );

      const baseTotal = result[0]?.base_total ? parseInt(result[0].base_total, 10) : 0;
      const extraTotal = result[0]?.extra_total ? parseInt(result[0].extra_total, 10) : 0;
      const totalAccumulated = result[0]?.total_accumulated ? parseInt(result[0].total_accumulated, 10) : (baseTotal + extraTotal);

      if (tokensLimit <= 0) {
        return { tokensUsed: baseTotal, tokensExtraUsed: extraTotal, tokensCourtesyUsed: 0, totalAccumulated };
      }

      // Consumo base imputado (hasta el tope contratado)
      const tokensUsed = Math.min(baseTotal, tokensLimit);
      // Cortesía absorbida del plan base (desborde técnico previo al encendido de allow_extra)
      const baseCourtesy = Math.max(0, baseTotal - tokensLimit);
      // Cortesía absorbida del plan extra si excediera el 100% adicional
      const extraCourtesy = Math.max(0, extraTotal - tokensLimit);
      const tokensCourtesyUsed = baseCourtesy + extraCourtesy;

      // Consumo extra imputado (hasta el 100% adicional)
      const tokensExtraUsed = Math.min(extraTotal, tokensLimit);

      return { tokensUsed, tokensExtraUsed, tokensCourtesyUsed, totalAccumulated };
    } catch (e) {
      return { tokensUsed: 0, tokensExtraUsed: 0, tokensCourtesyUsed: 0, totalAccumulated: 0 };
    }
  }

  /**
   * Obtiene el acumulado total de tokens consumidos en el período activo.
   */
  async getTokensUsedInPeriod(schemaName: string, periodStart: Date, periodEnd: Date): Promise<number> {
    try {
      const result = await this.dataSource.query(
        `SELECT COALESCE(SUM(total_tokens), 0) AS total 
         FROM "${schemaName}".transaction_history 
         WHERE fecha_procesamiento >= $1 
           AND fecha_procesamiento < $2`,
        [periodStart, periodEnd]
      );

      return result[0]?.total ? parseInt(result[0].total, 10) : 0;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Valida la suscripción y los límites de consumo por tokens antes de procesar llamadas a modelos / LLMs.
   * Si allow_extra es true, permite consumo extra hasta un máximo del 100% adicional del plan (Hard Cap: 2x tokens_limit).
   */
  async checkSubscriptionLimits(
    schemaName: string,
    estimatedTokens: number = 0
  ): Promise<CheckSubscriptionResult> {
    // Esquema public (superadmin / sistema global) → no aplican restricciones de plan
    if (!schemaName || schemaName === 'public') {
      return { is_extra: false };
    }

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
    const periodStart = subtractBillingMonths(nextRenewal!, months);
    const periodEnd = nextRenewal!;

    // Obtener consumo desglosado en el período respetando la inmutabilidad de cortesías
    const consumption = await this.getTokensConsumptionInPeriod(schemaName, periodStart, periodEnd, tenantInfo.tokens_limit);
    const tokensLimit = tenantInfo.tokens_limit;
    const baseUsed = consumption.tokensUsed;
    const extraUsed = consumption.tokensExtraUsed;
    const courtesyUsed = consumption.tokensCourtesyUsed;

    // c) Verificar si cabe en el plan base (solo si no hubo desborde de cortesía y no se satura el plan base)
    if (courtesyUsed === 0 && (baseUsed + estimatedTokens <= tokensLimit)) {
      return { is_extra: false };
    }

    // Excede límite base: verificar si allow_extra == True
    if (tenantInfo.allow_extra) {
      const maxExtraTokens = tokensLimit; // Límite de consumo extra del 100% del plan

      // La cuota extra solo contabiliza lo que realmente se ha procesado como extra (extraUsed)
      if (extraUsed + estimatedTokens <= maxExtraTokens) {
        return { is_extra: true };
      }

      // Excede el 100% de tokens extra -> Rechazar con HTTP 402 EXTRA_TOKENS_LIMIT_EXCEEDED
      throw new HttpException(
        {
          code: 'EXTRA_TOKENS_LIMIT_EXCEEDED',
          message: `Ha alcanzado el límite máximo de consumo extra permitido (100% adicional del plan: ${maxExtraTokens.toLocaleString()} tokens). Extra consumido: ${extraUsed.toLocaleString()}.`,
          tokens_used: baseUsed,
          tokens_limit: tokensLimit,
          tokens_extra_used: extraUsed,
          tokens_extra_limit: maxExtraTokens,
          next_renewal_date: nextRenewal,
        } as SubscriptionErrorPayload,
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    // Excede límite y allow_extra == False -> Rechazar con HTTP 402 TOKENS_LIMIT_EXCEEDED
    throw new HttpException(
      {
        code: 'TOKENS_LIMIT_EXCEEDED',
        message: `Ha alcanzado el límite de tokens de su plan (${tokensLimit.toLocaleString()} tokens). Consumidos: ${baseUsed.toLocaleString()}.`,
        tokens_used: baseUsed,
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
    actionName?: string,
    auditContext?: ConsumptionAuditContext
  ): Promise<void> {
    let calculatedIsExtra = isExtra;
    if (!calculatedIsExtra) {
      try {
        const tenantInfo = await this.getTenantPlanInfo(schemaName);
        if (tenantInfo && tenantInfo.allow_extra && tenantInfo.next_renewal_date && tenantInfo.tokens_limit > 0) {
          const months = tenantInfo.billing_period_months || 1;
          const periodStart = subtractBillingMonths(new Date(tenantInfo.next_renewal_date), months);
          
          const consumption = await this.getTokensConsumptionInPeriod(schemaName, periodStart, tenantInfo.next_renewal_date, tenantInfo.tokens_limit);
          // Si el plan base ya se saturó (baseUsed >= tokensLimit o hubo desborde de cortesía), esta nueva transacción ES EXTRA
          if (consumption.tokensCourtesyUsed > 0 || consumption.tokensUsed >= tenantInfo.tokens_limit) {
            calculatedIsExtra = true;
          }
        }
      } catch (err) {
        // Ignorar fallback
      }
    }

    await this.dataSource.query(
      `INSERT INTO "${schemaName}".transaction_history 
       (prompt_tokens, completion_tokens, total_tokens, fecha_procesamiento, is_extra, action_name,
        user_id, user_name, client_id, client_name, conversation_id, channel, model_name, metadata) 
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        promptTokens,
        completionTokens,
        totalTokens,
        calculatedIsExtra,
        actionName || null,
        auditContext?.userId || null,
        auditContext?.userName || null,
        auditContext?.clientId || null,
        auditContext?.clientName || null,
        auditContext?.conversationId || null,
        auditContext?.channel || null,
        auditContext?.modelName || null,
        auditContext?.metadata ? JSON.stringify(auditContext.metadata) : null,
      ]
    );
  }
}
