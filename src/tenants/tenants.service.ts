import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from './entities/tenant.entity';
import { TenantRenewalQueue } from './entities/tenant-renewal-queue.entity';
import { TenantBillingCycle } from './entities/tenant-billing-cycle.entity';
import { User } from '../users/entities/user.entity';
import { Plan } from '../plans/entities/plan.entity';
import { TenantProvisionerService } from '../tenancy/tenant-provisioner.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { UpdateTenantPlanDto } from './dto/update-tenant-plan.dto';
import { EnqueueRenewalDto } from './dto/enqueue-renewal.dto';
import { UpdateQueueItemDto } from './dto/update-queue-item.dto';

import { SubscriptionValidatorService } from '../subscriptions/subscription-validator.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { addBillingMonths, subtractBillingMonths } from '../common/utils/billing-date.util';

@Injectable()
export class TenantsService implements OnModuleInit {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantRenewalQueue)
    private readonly queueRepository: Repository<TenantRenewalQueue>,
    @InjectRepository(TenantBillingCycle)
    private readonly billingCycleRepository: Repository<TenantBillingCycle>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    private readonly tenantProvisioner: TenantProvisionerService,
    private readonly subscriptionValidator: SubscriptionValidatorService,
    private readonly dataSource: DataSource
  ) {}

  formatLogoUrl(logo: string | null): string | null {
    if (!logo) return null;
    if (logo.startsWith('http://') || logo.startsWith('https://')) {
      return logo;
    }
    const port = process.env.PORT || '3091';
    const baseUrl = (process.env.API_URL || process.env.PUBLIC_SERVER_URL || `http://localhost:${port}`).replace(/\/$/, '');
    const cleanLogo = logo.startsWith('/') ? logo : `/${logo}`;
    return `${baseUrl}${cleanLogo}`;
  }

  async getConsumption(
    schemaName?: string,
    overridePeriod?: { startDate: Date; endDate: Date; cycleId?: number }
  ) {
    const activeSchema = schemaName || TenantContextService.getTenantSchema() || 'public';

    // 1. Obtener información del plan de la organización
    const tenantInfo = await this.subscriptionValidator.getTenantPlanInfo(activeSchema);

    let tokensUsed = 0;
    let tokensExtraUsed = 0;
    let tokensCourtesyUsed = 0;
    let totalTokensAccumulated = 0;
    let tokensLimit = tenantInfo?.tokens_limit || 300000;
    let nextRenewal = tenantInfo?.next_renewal_date || null;
    let planName = tenantInfo?.plan_name || 'Plan Pro';
    let price = tenantInfo?.price || 0;
    let allowExtra = tenantInfo?.allow_extra ?? false;
    let tenantName = tenantInfo?.tenant_name || '';
    let isActive = tenantInfo?.is_active ?? true;
    let tenantId = tenantInfo?.tenant_id || null;
    let logo: string | null = null;
    let cycleId: number | null = overridePeriod?.cycleId || null;

    if (tenantInfo?.logo) {
      logo = this.formatLogoUrl(tenantInfo.logo);
    } else if (tenantInfo?.tenant_id) {
      const fullTenant = await this.tenantRepository.findOne({ where: { id: tenantInfo.tenant_id } });
      if (fullTenant?.logo) {
        logo = this.formatLogoUrl(fullTenant.logo);
      }
    }

    // Si se especifica un cycleId, tomar la configuración y límites de dicho ciclo histórico
    if (cycleId) {
      const cycle = await this.billingCycleRepository.findOne({ where: { id: cycleId } });
      if (cycle) {
        planName = cycle.plan_name;
        tokensLimit = cycle.tokens_limit;
        price = Number(cycle.price);
        allowExtra = cycle.allow_extra;
        nextRenewal = cycle.end_date;
      }
    }

    if (overridePeriod) {
      const consumptionResult = await this.subscriptionValidator.getTokensConsumptionInPeriod(
        activeSchema,
        overridePeriod.startDate,
        overridePeriod.endDate,
        tokensLimit
      );
      tokensUsed = consumptionResult.tokensUsed;
      tokensExtraUsed = consumptionResult.tokensExtraUsed;
      tokensCourtesyUsed = consumptionResult.tokensCourtesyUsed;
      totalTokensAccumulated = consumptionResult.totalAccumulated;
    } else if (tenantInfo && nextRenewal) {
      const months = tenantInfo.billing_period_months || 1;
      const periodStart = subtractBillingMonths(new Date(nextRenewal), months);
      const periodEnd = nextRenewal;

      const consumptionResult = await this.subscriptionValidator.getTokensConsumptionInPeriod(
        tenantInfo.schema_name,
        periodStart,
        periodEnd,
        tokensLimit
      );
      tokensUsed = consumptionResult.tokensUsed;
      tokensExtraUsed = consumptionResult.tokensExtraUsed;
      tokensCourtesyUsed = consumptionResult.tokensCourtesyUsed;
      totalTokensAccumulated = consumptionResult.totalAccumulated;
    } else if (activeSchema !== 'public') {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const consumptionResult = await this.subscriptionValidator.getTokensConsumptionInPeriod(
        activeSchema,
        periodStart,
        now,
        tokensLimit
      );
      tokensUsed = consumptionResult.tokensUsed;
      tokensExtraUsed = consumptionResult.tokensExtraUsed;
      tokensCourtesyUsed = consumptionResult.tokensCourtesyUsed;
      totalTokensAccumulated = consumptionResult.totalAccumulated;
    }

    // 2. Conteo de documentos ingestados en RAG en el esquema del tenant
    let documentsUsed = 0;
    try {
      const targetTable = activeSchema && activeSchema !== 'public'
        ? `"${activeSchema}".product_knowledge_base`
        : `public.product_knowledge_base`;
      const docRes = await this.dataSource.query(
        `SELECT COUNT(DISTINCT metadata->>'source') AS count FROM ${targetTable}`
      );
      documentsUsed = docRes[0]?.count ? parseInt(docRes[0].count, 10) : 0;
    } catch (e) {
      documentsUsed = 0;
    }

    // Cortesía técnica absorbida permanente (inmune al toggle de allow_extra)
    const overageAbsorbed = tokensCourtesyUsed;
    const hasCourtesyOverage = overageAbsorbed > 0;

    // Tokens extra utilizados: exclusivamente transacciones con is_extra = true
    const visibleTokensExtraUsed = allowExtra ? tokensExtraUsed : 0;

    const tokensExtraLimit = allowExtra ? tokensLimit : 0;
    const totalTokensLimit = tokensLimit + tokensExtraLimit;
    const totalTokensConsumed = totalTokensAccumulated;
    const extraPercentageUsed = tokensExtraLimit > 0 
      ? Math.min(100, Math.round((visibleTokensExtraUsed / tokensExtraLimit) * 100)) 
      : 0;

    return {
      tenant_id: tenantId,
      tenant_name: tenantName,
      schema_name: activeSchema,
      cycle_id: cycleId,
      is_active: isActive,
      allow_extra: allowExtra,
      logo: logo,
      documents_used: documentsUsed,
      tokens_used: tokensUsed,
      tokens_extra_used: visibleTokensExtraUsed,
      tokens_limit: tokensLimit,
      tokens_extra_limit: tokensExtraLimit,
      total_tokens_limit: totalTokensLimit,
      total_tokens_consumed: totalTokensConsumed,
      tokens_overage_absorbed: overageAbsorbed,
      has_courtesy_overage: overageAbsorbed > 0,
      extra_percentage_used: extraPercentageUsed,
      next_renewal_date: nextRenewal,
      plan_name: planName,
      price: price,
    };
  }

  /**
   * Reporte global para SuperAdmin con el desglose de consumo, tokens extra y desbordes absorbidos por cortesía.
   */
  async getCourtesyOveragesReport() {
    const tenants = await this.tenantRepository.find({ relations: ['plan'], order: { name: 'ASC' } });
    const report = [];

    for (const tenant of tenants) {
      if (tenant.schema_name === 'public') continue;

      const consumption = await this.getConsumption(tenant.schema_name);
      report.push({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        schema_name: tenant.schema_name,
        plan_name: consumption.plan_name,
        is_active: tenant.is_active,
        allow_extra: tenant.allow_extra,
        tokens_limit: consumption.tokens_limit,
        tokens_used: consumption.tokens_used,
        tokens_extra_used: consumption.tokens_extra_used,
        tokens_overage_absorbed: consumption.tokens_overage_absorbed,
        has_courtesy_overage: consumption.has_courtesy_overage,
        total_tokens_consumed: consumption.total_tokens_consumed,
        next_renewal_date: consumption.next_renewal_date,
      });
    }

    return {
      total_tenants: report.length,
      tenants_with_courtesy_overage: report.filter(r => r.has_courtesy_overage).length,
      total_tokens_absorbed: report.reduce((acc, r) => acc + r.tokens_overage_absorbed, 0),
      report,
    };
  }

  /**
   * Obtiene un desglose analítico del consumo de tokens en un periodo de facturación (activo o histórico) o rango de fechas:
   * - Agrupado por canal (whatsapp, webchat_interno, rag, etc.)
   * - Top usuarios internos con mayor consumo (webchat)
   * - Top clientes externos con mayor consumo (whatsapp, etc.)
   * - Consumo por modelo LLM (gemini-1.5-flash, gpt-4o, etc.)
   * - Línea de tiempo diaria de consumo
   * - Últimas transacciones detalladas
   */
  async getConsumptionBreakdown(
    schemaName?: string,
    tenantId?: number,
    cycleId?: number,
    startDate?: string,
    endDate?: string
  ) {
    let targetSchema = schemaName;
    let targetTenantId = tenantId;

    if (!targetSchema && targetTenantId) {
      const tenant = await this.tenantRepository.findOne({ where: { id: targetTenantId } });
      if (tenant) {
        targetSchema = tenant.schema_name;
      }
    }

    if (!targetSchema) {
      targetSchema = TenantContextService.getTenantSchema() || 'public';
    }

    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    let selectedCycle: TenantBillingCycle | null = null;

    // 1. Si se solicita un ciclo de facturación específico
    if (cycleId) {
      selectedCycle = await this.billingCycleRepository.findOne({ where: { id: cycleId } });
      if (selectedCycle) {
        periodStart = new Date(selectedCycle.start_date);
        periodEnd = selectedCycle.closed_at ? new Date(selectedCycle.closed_at) : new Date(selectedCycle.end_date);
      }
    }

    // 2. Si se solicitó un rango de fechas personalizado
    if (!selectedCycle && startDate && endDate) {
      periodStart = new Date(startDate);
      const end = new Date(endDate);
      if (endDate.length <= 10) {
        end.setHours(23, 59, 59, 999);
      }
      periodEnd = end;
    }

    // 3. Si no hay periodo especificado, resolver el ciclo activo por defecto
    if (!periodStart || !periodEnd) {
      const tenantInfo = await this.subscriptionValidator.getTenantPlanInfo(targetSchema);
      if (tenantInfo?.next_renewal_date) {
        const months = tenantInfo.billing_period_months || 1;
        periodStart = subtractBillingMonths(new Date(tenantInfo.next_renewal_date), months);
        periodEnd = new Date(tenantInfo.next_renewal_date);
      } else {
        const now = new Date();
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = now;
      }
    }

    if (!targetSchema || targetSchema === 'public') {
      const summary = await this.getConsumption(targetSchema);
      return {
        schema_name: targetSchema,
        cycle_id: selectedCycle?.id || null,
        cycle_info: null,
        period: { start: null, end: null },
        summary,
        by_channel: [],
        top_users: [],
        top_clients: [],
        by_model: [],
        daily_timeline: [],
        recent_transactions: [],
      };
    }

    try {
      // 2. Ejecutar Summary y las 6 consultas analíticas en PARALELO
      const [
        summary,
        byChannelRaw,
        topUsersRaw,
        topClientsRaw,
        byModelRaw,
        dailyTimelineRaw,
        recentTransactionsRaw,
      ] = await Promise.all([
        this.getConsumption(targetSchema, {
          startDate: periodStart,
          endDate: periodEnd,
          cycleId: selectedCycle?.id,
        }),
        // Agrupación por canal
        this.dataSource.query(
          `SELECT 
            COALESCE(channel, 'otro') AS channel,
            COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
            COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens,
            COUNT(*)::int AS request_count
           FROM "${targetSchema}".transaction_history
           WHERE fecha_procesamiento >= $1 AND fecha_procesamiento <= $2
           GROUP BY channel
           ORDER BY total_tokens DESC`,
          [periodStart, periodEnd],
        ),


        // Top usuarios internos (Webchat CRM, etc.)
        this.dataSource.query(
          `SELECT 
            user_id,
            COALESCE(user_name, 'Usuario ' || user_id::text) AS user_name,
            COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
            COUNT(*)::int AS request_count
           FROM "${targetSchema}".transaction_history
           WHERE fecha_procesamiento >= $1 AND fecha_procesamiento <= $2 AND user_id IS NOT NULL
           GROUP BY user_id, user_name
           ORDER BY total_tokens DESC
           LIMIT 10`,
          [periodStart, periodEnd],
        ),

        // Top clientes externos (WhatsApp, etc.)
        this.dataSource.query(
          `SELECT 
            client_id,
            COALESCE(client_name, 'Cliente ' || client_id::text) AS client_name,
            COALESCE(channel, 'whatsapp') AS channel,
            COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
            COUNT(*)::int AS request_count
           FROM "${targetSchema}".transaction_history
           WHERE fecha_procesamiento >= $1 AND fecha_procesamiento <= $2 AND client_id IS NOT NULL
           GROUP BY client_id, client_name, channel
           ORDER BY total_tokens DESC
           LIMIT 10`,
          [periodStart, periodEnd],
        ),

        // Consumo por modelo LLM
        this.dataSource.query(
          `SELECT 
            COALESCE(model_name, 'No especificado') AS model_name,
            COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
            COUNT(*)::int AS request_count
           FROM "${targetSchema}".transaction_history
           WHERE fecha_procesamiento >= $1 AND fecha_procesamiento <= $2
           GROUP BY model_name
           ORDER BY total_tokens DESC`,
          [periodStart, periodEnd],
        ),

        // Línea de tiempo diaria
        this.dataSource.query(
          `SELECT 
            TO_CHAR(fecha_procesamiento, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
            COUNT(*)::int AS request_count
           FROM "${targetSchema}".transaction_history
           WHERE fecha_procesamiento >= $1 AND fecha_procesamiento <= $2
           GROUP BY TO_CHAR(fecha_procesamiento, 'YYYY-MM-DD')
           ORDER BY date ASC`,
          [periodStart, periodEnd],
        ),

        // Últimas transacciones detalladas
        this.dataSource.query(
          `SELECT 
            id,
            fecha_procesamiento,
            action_name AS accion,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            is_extra,
            user_id,
            user_name,
            client_id,
            client_name,
            conversation_id,
            channel,
            model_name,
            metadata
           FROM "${targetSchema}".transaction_history
           WHERE fecha_procesamiento >= $1 AND fecha_procesamiento <= $2
           ORDER BY fecha_procesamiento DESC
           LIMIT 50`,
          [periodStart, periodEnd],
        ),
      ]);

      return {
        schema_name: targetSchema,
        cycle_id: selectedCycle?.id || null,
        cycle_info: selectedCycle ? {
          id: selectedCycle.id,
          plan_name: selectedCycle.plan_name,
          tokens_limit: selectedCycle.tokens_limit,
          price: Number(selectedCycle.price),
          status: selectedCycle.status,
          start_date: selectedCycle.start_date,
          end_date: selectedCycle.end_date,
          closed_at: selectedCycle.closed_at,
          close_reason: selectedCycle.close_reason,
          allow_extra: selectedCycle.allow_extra,
        } : null,
        period: {
          start: periodStart,
          end: periodEnd,
        },
        summary,
        by_channel: byChannelRaw.map((r: any) => ({
          channel: r.channel,
          total_tokens: Number(r.total_tokens),
          prompt_tokens: Number(r.prompt_tokens),
          completion_tokens: Number(r.completion_tokens),
          request_count: Number(r.request_count),
        })),
        top_users: topUsersRaw.map((r: any) => ({
          user_id: r.user_id,
          user_name: r.user_name,
          total_tokens: Number(r.total_tokens),
          request_count: Number(r.request_count),
        })),
        top_clients: topClientsRaw.map((r: any) => ({
          client_id: r.client_id,
          client_name: r.client_name,
          channel: r.channel,
          total_tokens: Number(r.total_tokens),
          request_count: Number(r.request_count),
        })),
        by_model: byModelRaw.map((r: any) => ({
          model_name: r.model_name,
          total_tokens: Number(r.total_tokens),
          request_count: Number(r.request_count),
        })),
        daily_timeline: dailyTimelineRaw.map((r: any) => ({
          date: r.date,
          total_tokens: Number(r.total_tokens),
          request_count: Number(r.request_count),
        })),
        recent_transactions: recentTransactionsRaw.map((r: any) => ({
          id: r.id,
          fecha_procesamiento: r.fecha_procesamiento,
          accion: r.accion,
          prompt_tokens: Number(r.prompt_tokens),
          completion_tokens: Number(r.completion_tokens),
          total_tokens: Number(r.total_tokens),
          is_extra: r.is_extra,
          user_id: r.user_id,
          user_name: r.user_name,
          client_id: r.client_id,
          client_name: r.client_name,
          conversation_id: r.conversation_id,
          channel: r.channel,
          model_name: r.model_name,
          metadata: r.metadata,
        })),
      };
    } catch (err: any) {
      this.logger.error(`Error al obtener desglose de consumo para ${targetSchema}: ${err.message}`);
      const fallbackSummary = await this.getConsumption(targetSchema).catch(() => null);
      return {
        schema_name: targetSchema,
        cycle_id: selectedCycle?.id || null,
        cycle_info: null,
        period: { start: periodStart, end: periodEnd },
        summary: fallbackSummary,
        by_channel: [],
        top_users: [],
        top_clients: [],
        by_model: [],
        daily_timeline: [],
        recent_transactions: [],
      };
    }
  }

  async getCurrentTenant(schemaName?: string) {
    const activeSchema = schemaName || TenantContextService.getTenantSchema() || 'public';
    const tenantInfo = await this.subscriptionValidator.getTenantPlanInfo(activeSchema);
    let tenant: Tenant | null = null;
    if (!tenantInfo) {
      tenant = await this.tenantRepository.findOne({ where: { schema_name: 'public' }, relations: ['plan'] });
    } else {
      tenant = await this.tenantRepository.findOne({ where: { id: tenantInfo.tenant_id }, relations: ['plan'] });
    }
    if (tenant && tenant.logo) {
      tenant.logo = this.formatLogoUrl(tenant.logo);
    }
    return tenant;
  }

  async updateLogo(tenantId: number, logoUrl: string) {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con ID ${tenantId} no encontrado.`);
    }
    tenant.logo = logoUrl;
    await this.tenantRepository.save(tenant);
    tenant.logo = this.formatLogoUrl(logoUrl);
    return tenant;
  }

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS public.tenant_billing_cycles (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(63) NOT NULL,
          plan_id INTEGER NULL,
          plan_name VARCHAR(255) NOT NULL,
          tokens_limit INTEGER NOT NULL DEFAULT 0,
          price NUMERIC(10, 2) NOT NULL DEFAULT 0,
          billing_period_months INTEGER NOT NULL DEFAULT 1,
          start_date TIMESTAMPTZ NOT NULL,
          end_date TIMESTAMPTZ NOT NULL,
          closed_at TIMESTAMPTZ NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          close_reason VARCHAR(50) NULL,
          allow_extra BOOLEAN NOT NULL DEFAULT false,
          tokens_used_at_close INTEGER NULL DEFAULT 0,
          tokens_extra_used_at_close INTEGER NULL DEFAULT 0,
          tokens_courtesy_at_close INTEGER NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_billing_cycle_plan FOREIGN KEY (plan_id) REFERENCES public.plans(plan_id) ON DELETE SET NULL
        );
      `);

      // Backfill automático para tenants existentes que aún no tengan ciclo registrado
      const tenants = await this.tenantRepository.find({ relations: ['plan'] });
      for (const t of tenants) {
        if (t.schema_name === 'public') continue;
        const count = await this.billingCycleRepository.count({ where: { tenant_id: String(t.id) } });
        if (count === 0) {
          const months = t.plan?.billing_period_months || 1;
          const now = new Date();
          let startDate: Date;
          let endDate: Date;

          if (t.next_renewal_date) {
            endDate = new Date(t.next_renewal_date);
            startDate = subtractBillingMonths(endDate, months);
          } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = addBillingMonths(startDate, 1);
          }

          const initialCycle = this.billingCycleRepository.create({
            tenant_id: String(t.id),
            plan_id: t.plan_id || null,
            plan_name: t.plan?.plan_name || 'Plan Pro',
            tokens_limit: t.plan?.tokens_limit || 300000,
            price: t.plan?.price || 0,
            billing_period_months: months,
            start_date: startDate,
            end_date: endDate,
            status: t.is_active ? 'active' : 'closed',
            allow_extra: t.allow_extra ?? false,
            tokens_used_at_close: 0,
            tokens_extra_used_at_close: 0,
            tokens_courtesy_at_close: 0,
          });
          await this.billingCycleRepository.save(initialCycle);
          this.logger.log(`Backfill de ciclo inicial creado para organización '${t.name}' (ID ${t.id}).`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error en onModuleInit de TenantsService: ${err.message}`);
    }
  }

  /**
   * Obtiene el historial completo de ciclos de facturación de un tenant (activos y pasados)
   * calculando el consumo dinámico en tiempo real para el ciclo activo.
   */
  async getBillingCycles(tenantId?: number, schemaName?: string) {
    let targetTenant: Tenant | null = null;
    if (tenantId) {
      targetTenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    } else if (schemaName) {
      targetTenant = await this.tenantRepository.findOne({ where: { schema_name: schemaName } });
    } else {
      const activeSchema = TenantContextService.getTenantSchema() || 'public';
      targetTenant = await this.tenantRepository.findOne({ where: { schema_name: activeSchema } });
    }

    if (!targetTenant) {
      return [];
    }

    const cycles = await this.billingCycleRepository.find({
      where: { tenant_id: String(targetTenant.id) },
      order: { start_date: 'DESC', id: 'DESC' },
    });

    const result = await Promise.all(
      cycles.map(async (cycle) => {
        let tokensUsed = cycle.tokens_used_at_close || 0;
        let tokensExtraUsed = cycle.tokens_extra_used_at_close || 0;
        let tokensCourtesyUsed = cycle.tokens_courtesy_at_close || 0;
        let totalAccumulated = tokensUsed + tokensExtraUsed + tokensCourtesyUsed;

        if (cycle.status === 'active' && targetTenant) {
          const consumption = await this.subscriptionValidator.getTokensConsumptionInPeriod(
            targetTenant.schema_name,
            cycle.start_date,
            cycle.end_date,
            cycle.tokens_limit
          );
          tokensUsed = consumption.tokensUsed;
          tokensExtraUsed = cycle.allow_extra ? consumption.tokensExtraUsed : 0;
          tokensCourtesyUsed = consumption.tokensCourtesyUsed;
          totalAccumulated = consumption.totalAccumulated;
        }

        return {
          id: cycle.id,
          tenant_id: cycle.tenant_id,
          plan_id: cycle.plan_id,
          plan_name: cycle.plan_name,
          tokens_limit: cycle.tokens_limit,
          price: Number(cycle.price),
          billing_period_months: cycle.billing_period_months,
          start_date: cycle.start_date,
          end_date: cycle.end_date,
          closed_at: cycle.closed_at,
          status: cycle.status,
          close_reason: cycle.close_reason,
          allow_extra: cycle.allow_extra,
          tokens_used: tokensUsed,
          tokens_extra_used: tokensExtraUsed,
          tokens_courtesy_used: tokensCourtesyUsed,
          total_tokens_consumed: totalAccumulated,
          created_at: cycle.created_at,
        };
      })
    );

    return result;
  }

  async provision(dto: ProvisionTenantDto) {
    return this.tenantProvisioner.provisionTenant(dto);
  }

  async findAll() {
    const rawRows = await this.dataSource.query(`
      SELECT 
        t.id,
        t.name,
        t.schema_name,
        t.plan_id,
        t.next_renewal_date,
        t.is_active,
        t.allow_extra,
        t.logo,
        t.created_at,
        COALESCE(q.total_queued_periods, 0)::int AS total_queued_periods,
        CASE 
          WHEN COALESCE(q.total_queued_periods, 0) = 0 THEN t.next_renewal_date
          ELSE (
            (CASE 
              WHEN t.next_renewal_date IS NOT NULL AND t.next_renewal_date > NOW() 
              THEN t.next_renewal_date 
              ELSE NOW() 
            END) + (COALESCE(q.total_months, 0) || ' months')::interval
          )
        END AS coverage_until,
        CASE 
          WHEN p.plan_id IS NOT NULL THEN json_build_object(
            'plan_id', p.plan_id,
            'plan_name', p.plan_name,
            'price', p.price::float,
            'tokens_limit', p.tokens_limit::bigint,
            'billing_period_months', p.billing_period_months,
            'blnstatus', p.blnstatus,
            'dtmcreated', p.dtmcreated,
            'dtmlastmodified', p.dtmlastmodified
          )
          ELSE NULL
        END AS plan
      FROM public.tenants t
      LEFT JOIN public.plans p ON p.plan_id = t.plan_id
      LEFT JOIN (
        SELECT 
          tenant_id,
          COUNT(*)::int AS total_queued_periods,
          SUM(COALESCE(billing_period_months, 1))::int AS total_months
        FROM public.tenant_renewal_queue
        GROUP BY tenant_id
      ) q ON q.tenant_id = t.id::text
      ORDER BY t.created_at DESC
    `);

    return rawRows.map((row: any) => ({
      id: Number(row.id),
      name: row.name,
      schema_name: row.schema_name,
      plan_id: row.plan_id !== null ? Number(row.plan_id) : null,
      next_renewal_date: row.next_renewal_date ? new Date(row.next_renewal_date).toISOString() : null,
      is_active: Boolean(row.is_active),
      allow_extra: Boolean(row.allow_extra),
      logo: this.formatLogoUrl(row.logo),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : row.created_at,
      total_queued_periods: Number(row.total_queued_periods || 0),
      coverage_until: row.coverage_until ? new Date(row.coverage_until).toISOString() : null,
      plan: row.plan ? {
        plan_id: Number(row.plan.plan_id),
        plan_name: row.plan.plan_name,
        price: Number(row.plan.price),
        tokens_limit: Number(row.plan.tokens_limit),
        billing_period_months: Number(row.plan.billing_period_months),
        blnstatus: Boolean(row.plan.blnstatus),
        dtmcreated: row.plan.dtmcreated,
        dtmlastmodified: row.plan.dtmlastmodified,
      } : null,
    }));
  }

  async findOne(id: number) {
    const tenant = await this.tenantRepository.findOne({ where: { id }, relations: ['plan'] });
    if (!tenant) {
      throw new NotFoundException(`Tenant con ID ${id} no encontrado.`);
    }
    if (tenant.logo) {
      tenant.logo = this.formatLogoUrl(tenant.logo);
    }
    const queueMetrics = await this.dataSource.query(
      `SELECT 
        COUNT(*)::int AS total_queued_periods,
        SUM(COALESCE(billing_period_months, 1))::int AS total_months
       FROM public.tenant_renewal_queue
       WHERE tenant_id = $1`,
      [String(tenant.id)],
    );
    const periods = Number(queueMetrics[0]?.total_queued_periods || 0);
    const months = Number(queueMetrics[0]?.total_months || 0);
    tenant.total_queued_periods = periods;
    if (periods === 0) {
      tenant.coverage_until = tenant.next_renewal_date ? new Date(tenant.next_renewal_date).toISOString() : null;
    } else {
      const now = new Date();
      const baseDate = tenant.next_renewal_date && tenant.next_renewal_date > now
        ? new Date(tenant.next_renewal_date)
        : new Date(now);
      tenant.coverage_until = addBillingMonths(baseDate, months).toISOString();
    }
    return tenant;
  }

  /**
   * Obtiene la cola de renovación de un tenant con la proyección encadenada de inicio y fin de cada período.
   */
  async getRenewalQueue(tenantId: number) {
    const tenant = await this.findOne(tenantId);
    const queueItems = await this.queueRepository.find({
      where: { tenant_id: String(tenant.id) },
      relations: ['plan'],
      order: { created_at: 'ASC', id: 'ASC' },
    });

    const now = new Date();
    // La base de inicio es next_renewal_date si está vigente en el futuro, o NOW() si ya venció
    let cursorDate = tenant.next_renewal_date && tenant.next_renewal_date > now
      ? new Date(tenant.next_renewal_date)
      : new Date(now);

    const projectedItems = queueItems.map((item, index) => {
      const months = item.billing_period_months || item.plan?.billing_period_months || 1;
      const periodStart = new Date(cursorDate);
      const periodEnd = addBillingMonths(cursorDate, months);

      // Avanzar cursor para el siguiente período de la cadena
      cursorDate = new Date(periodEnd);

      return {
        queue_id: item.id,
        tenant_id: item.tenant_id,
        queue_position: index + 1,
        plan_id: item.plan_id,
        plan_name: item.plan?.plan_name || 'Desconocido',
        tokens_limit: item.plan?.tokens_limit || 0,
        price: item.plan?.price || 0,
        billing_period_months: months,
        projected_start_date: periodStart,
        projected_end_date: periodEnd,
        created_at: item.created_at,
      };
    });

    const totalMonths = queueItems.reduce((acc, it) => acc + (it.billing_period_months || 1), 0);

    return {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      current_plan: tenant.plan ? {
        plan_id: tenant.plan.plan_id,
        plan_name: tenant.plan.plan_name,
        tokens_limit: tenant.plan.tokens_limit,
        billing_period_months: tenant.plan.billing_period_months,
      } : null,
      current_next_renewal_date: tenant.next_renewal_date,
      is_active: tenant.is_active,
      total_queued_periods: queueItems.length,
      total_queued_months: totalMonths,
      coverage_until: queueItems.length > 0 ? cursorDate : tenant.next_renewal_date,
      items: projectedItems,
    };
  }

  /**
   * Actualiza el plan del tenant con soporte de:
   * - Cambio inmediato ('immediate'): reiniciando fecha ('reset_date') o conservando fecha actual ('keep_current_date').
   * - Cambio al próximo período ('next_period'): programa el nuevo plan en la cola de renovación sin alterar el período activo.
   */
  async updatePlan(
    tenantId: number,
    dtoOrPlanId: UpdateTenantPlanDto | number,
    legacyMonths: number = 1,
    legacyAllowExtra?: boolean
  ) {
    const tenant = await this.findOne(tenantId);

    // Normalizar DTO para soportar tanto objeto como parámetros individuales legados
    let dto: UpdateTenantPlanDto;
    if (typeof dtoOrPlanId === 'number') {
      dto = {
        planId: dtoOrPlanId,
        months: legacyMonths,
        allowExtra: legacyAllowExtra,
        changeType: 'immediate',
        immediatePolicy: 'reset_date',
      };
    } else {
      dto = dtoOrPlanId;
    }

    const targetPlan = await this.planRepository.findOne({ where: { plan_id: dto.planId } });
    if (!targetPlan || !targetPlan.blnstatus) {
      throw new NotFoundException(`Plan con ID ${dto.planId} no encontrado o se encuentra inactivo.`);
    }

    const changeType = dto.changeType || 'immediate';
    const months = dto.months || targetPlan.billing_period_months || 1;

    if (dto.allowExtra !== undefined) {
      tenant.allow_extra = dto.allowExtra;
    }

    if (changeType === 'immediate') {
      // 1. Cambio Inmediato
      tenant.plan_id = targetPlan.plan_id;
      tenant.plan = targetPlan;
      tenant.is_active = true;

      const now = new Date();
      let activeCycle = await this.billingCycleRepository.findOne({
        where: { tenant_id: String(tenant.id), status: 'active' },
        order: { start_date: 'DESC' },
      });

      if (dto.immediatePolicy === 'keep_current_date' && tenant.next_renewal_date && tenant.next_renewal_date > now) {
        // Conservar la fecha de renovación actual
        if (activeCycle) {
          activeCycle.plan_id = targetPlan.plan_id;
          activeCycle.plan_name = targetPlan.plan_name;
          activeCycle.tokens_limit = targetPlan.tokens_limit;
          activeCycle.price = targetPlan.price;
          activeCycle.billing_period_months = months;
          activeCycle.close_reason = 'immediate_keep_date';
          if (dto.allowExtra !== undefined) {
            activeCycle.allow_extra = dto.allowExtra;
          }
          await this.billingCycleRepository.save(activeCycle);
        } else {
          activeCycle = this.billingCycleRepository.create({
            tenant_id: String(tenant.id),
            plan_id: targetPlan.plan_id,
            plan_name: targetPlan.plan_name,
            tokens_limit: targetPlan.tokens_limit,
            price: targetPlan.price,
            billing_period_months: months,
            start_date: tenant.created_at || now,
            end_date: tenant.next_renewal_date,
            status: 'active',
            close_reason: 'immediate_keep_date',
            allow_extra: tenant.allow_extra,
          });
          await this.billingCycleRepository.save(activeCycle);
        }
      } else {
        // Reiniciar ciclo calculando desde ahora con protección de bisiestos y fin de mes
        const nextRenewal = addBillingMonths(now, months);
        tenant.next_renewal_date = nextRenewal;

        // Congelar y cerrar ciclo activo previo
        if (activeCycle) {
          const consumption = await this.subscriptionValidator.getTokensConsumptionInPeriod(
            tenant.schema_name,
            activeCycle.start_date,
            now,
            activeCycle.tokens_limit
          );
          activeCycle.status = 'closed';
          activeCycle.closed_at = now;
          activeCycle.close_reason = 'immediate_reset';
          activeCycle.tokens_used_at_close = consumption.tokensUsed;
          activeCycle.tokens_extra_used_at_close = activeCycle.allow_extra ? consumption.tokensExtraUsed : 0;
          activeCycle.tokens_courtesy_at_close = consumption.tokensCourtesyUsed;
          await this.billingCycleRepository.save(activeCycle);
        }

        // Abrir nuevo ciclo activo
        const newCycle = this.billingCycleRepository.create({
          tenant_id: String(tenant.id),
          plan_id: targetPlan.plan_id,
          plan_name: targetPlan.plan_name,
          tokens_limit: targetPlan.tokens_limit,
          price: targetPlan.price,
          billing_period_months: months,
          start_date: now,
          end_date: nextRenewal,
          status: 'active',
          allow_extra: tenant.allow_extra,
          tokens_used_at_close: 0,
          tokens_extra_used_at_close: 0,
          tokens_courtesy_at_close: 0,
        });
        await this.billingCycleRepository.save(newCycle);
      }

      const savedTenant = await this.tenantRepository.save(tenant);

      // Si se solicita actualizar las colas pendientes al nuevo plan
      if (dto.updateQueuedPlans) {
        await this.queueRepository.update(
          { tenant_id: String(tenant.id) },
          { plan_id: targetPlan.plan_id, billing_period_months: months }
        );
      }

      const refreshed = await this.findOne(savedTenant.id);
      return {
        message: `Plan actualizado de forma inmediata a '${targetPlan.plan_name}'.`,
        change_type: 'immediate',
        tenant: refreshed,
      };
    } else {
      // 2. Cambio al Próximo Período de Facturación
      // No modificamos el plan_id activo ni next_renewal_date del tenant
      const existingQueueItems = await this.queueRepository.find({
        where: { tenant_id: String(tenant.id) },
        order: { created_at: 'ASC' },
      });

      if (existingQueueItems.length > 0) {
        // Si el usuario especificó actualizar todos o solo el primero
        if (dto.updateQueuedPlans !== false) {
          await this.queueRepository.update(
            { tenant_id: String(tenant.id) },
            { plan_id: targetPlan.plan_id, billing_period_months: months }
          );
        } else {
          const first = existingQueueItems[0];
          first.plan_id = targetPlan.plan_id;
          first.billing_period_months = months;
          await this.queueRepository.save(first);
        }
      } else {
        // Si no hay períodos en cola, encolamos automáticamente el primer período del nuevo plan
        const newItem = this.queueRepository.create({
          tenant_id: String(tenant.id),
          plan_id: targetPlan.plan_id,
          billing_period_months: months,
        });
        await this.queueRepository.save(newItem);
      }

      await this.tenantRepository.save(tenant);
      const refreshed = await this.findOne(tenant.id);

      return {
        message: `Cambio programado con éxito: el plan '${targetPlan.plan_name}' se aplicará automáticamente a partir del próximo período de facturación (${tenant.next_renewal_date ? tenant.next_renewal_date.toISOString() : 'próximo vencimiento'}).`,
        change_type: 'next_period',
        scheduled_plan: {
          plan_id: targetPlan.plan_id,
          plan_name: targetPlan.plan_name,
          billing_period_months: months,
        },
        tenant: refreshed,
      };
    }
  }

  /**
   * Encola una o varias renovaciones para el tenant, respetando meses y planes.
   */
  async enqueueRenewal(
    tenantId: number,
    dtoOrPlanId: EnqueueRenewalDto | number,
    legacyMonths: number = 1
  ) {
    const tenant = await this.findOne(tenantId);

    let planId: number | undefined;
    let months: number | undefined;
    let periodsCount: number = 1;

    if (typeof dtoOrPlanId === 'number') {
      planId = dtoOrPlanId;
      months = legacyMonths;
    } else if (dtoOrPlanId) {
      planId = dtoOrPlanId.planId;
      months = dtoOrPlanId.months;
      periodsCount = dtoOrPlanId.periodsCount || 1;
    }

    const resolvedPlanId = planId || tenant.plan_id;
    if (!resolvedPlanId) {
      throw new BadRequestException(`La organización '${tenant.name}' no tiene un plan asignado y no se especificó un planId.`);
    }

    const targetPlan = await this.planRepository.findOne({ where: { plan_id: resolvedPlanId } });
    if (!targetPlan || !targetPlan.blnstatus) {
      throw new NotFoundException(`Plan con ID ${resolvedPlanId} no encontrado o inactivo.`);
    }

    const resolvedMonths = months || targetPlan.billing_period_months || 1;

    const itemsToCreate: TenantRenewalQueue[] = [];
    for (let i = 0; i < periodsCount; i++) {
      itemsToCreate.push(
        this.queueRepository.create({
          tenant_id: String(tenant.id),
          plan_id: targetPlan.plan_id,
          billing_period_months: resolvedMonths,
        })
      );
    }

    const savedItems = await this.queueRepository.save(itemsToCreate);
    const queueSummary = await this.getRenewalQueue(tenant.id);

    return {
      message: `Se encolaron exitosamente ${periodsCount} período(s) de renovación para '${tenant.name}' con el plan '${targetPlan.plan_name}'.`,
      periods_enqueued: savedItems.length,
      plan: {
        plan_id: targetPlan.plan_id,
        plan_name: targetPlan.plan_name,
        price: targetPlan.price,
      },
      billing_period_months: resolvedMonths,
      total_queued_periods: queueSummary.total_queued_periods,
      coverage_until: queueSummary.coverage_until,
    };
  }

  /**
   * Modifica los datos de un período ya encolado (cambio de plan o meses).
   */
  async updateQueueItem(queueItemId: number, dto: UpdateQueueItemDto) {
    const item = await this.queueRepository.findOne({
      where: { id: queueItemId },
      relations: ['plan'],
    });

    if (!item) {
      throw new NotFoundException(`Elemento de cola con ID ${queueItemId} no encontrado.`);
    }

    if (dto.planId) {
      const newPlan = await this.planRepository.findOne({ where: { plan_id: dto.planId } });
      if (!newPlan || !newPlan.blnstatus) {
        throw new NotFoundException(`Plan con ID ${dto.planId} no encontrado o inactivo.`);
      }
      item.plan_id = newPlan.plan_id;
      if (!dto.billing_period_months) {
        item.billing_period_months = newPlan.billing_period_months || 1;
      }
    }

    if (dto.billing_period_months) {
      item.billing_period_months = dto.billing_period_months;
    }

    await this.queueRepository.save(item);

    const tenantIdNum = parseInt(item.tenant_id, 10);
    return isNaN(tenantIdNum) ? item : this.getRenewalQueue(tenantIdNum);
  }

  /**
   * Elimina un período específico de la cola de renovación.
   */
  async removeQueueItem(queueItemId: number) {
    const item = await this.queueRepository.findOne({ where: { id: queueItemId } });
    if (!item) {
      throw new NotFoundException(`Elemento de cola con ID ${queueItemId} no encontrado.`);
    }

    await this.queueRepository.remove(item);
    return {
      message: `Período de renovación en cola (ID ${queueItemId}) cancelado y eliminado correctamente.`,
      queue_id: queueItemId,
      tenant_id: item.tenant_id,
    };
  }

  /**
   * Vacía la cola completa de renovación de un tenant.
   */
  async clearRenewalQueue(tenantId: number) {
    const tenant = await this.findOne(tenantId);
    const deleteResult = await this.queueRepository.delete({ tenant_id: String(tenant.id) });
    return {
      message: `Cola de renovación para '${tenant.name}' eliminada correctamente.`,
      deleted_periods: deleteResult.affected || 0,
      tenant_id: tenant.id,
    };
  }

  async updateAllowExtra(tenantId: number, allowExtra: boolean) {
    const tenant = await this.findOne(tenantId);
    tenant.allow_extra = allowExtra;
    const saved = await this.tenantRepository.save(tenant);
    await this.billingCycleRepository.update(
      { tenant_id: String(tenant.id), status: 'active' },
      { allow_extra: allowExtra }
    );
    return saved;
  }

  async update(id: number, dto: { name?: string; is_active?: boolean; allow_extra?: boolean }) {
    const tenant = await this.findOne(id);
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.is_active !== undefined) tenant.is_active = dto.is_active;
    if (dto.allow_extra !== undefined) {
      tenant.allow_extra = dto.allow_extra;
      await this.billingCycleRepository.update(
        { tenant_id: String(tenant.id), status: 'active' },
        { allow_extra: dto.allow_extra }
      );
    }
    return this.tenantRepository.save(tenant);
  }

  async remove(id: number) {
    const tenant = await this.findOne(id);
    const schemaName = tenant.schema_name;

    await this.billingCycleRepository.delete({ tenant_id: String(tenant.id) });
    await this.queueRepository.delete({ tenant_id: String(tenant.id) });
    await this.tenantRepository.remove(tenant);

    if (schemaName && schemaName !== 'public' && /^[a-z0-9_]+$/.test(schemaName)) {
      try {
        await this.dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } catch (err) {
        // Ignorar error al eliminar el esquema
      }
    }

    return { message: `Organización '${tenant.name}' eliminada correctamente.` };
  }
}

