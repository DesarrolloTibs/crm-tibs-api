import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from './entities/tenant.entity';
import { TenantRenewalQueue } from './entities/tenant-renewal-queue.entity';
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
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantRenewalQueue)
    private readonly queueRepository: Repository<TenantRenewalQueue>,
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
    const baseUrl = (process.env.API_URL || process.env.PUBLIC_SERVER_URL || 'http://localhost:3000').replace(/\/$/, '');
    const cleanLogo = logo.startsWith('/') ? logo : `/${logo}`;
    return `${baseUrl}${cleanLogo}`;
  }

  async getConsumption(schemaName?: string) {
    const activeSchema = schemaName || TenantContextService.getTenantSchema() || 'public';

    // 1. Obtener información del plan de la organización
    const tenantInfo = await this.subscriptionValidator.getTenantPlanInfo(activeSchema);

    let tokensUsed = 0;
    let tokensExtraUsed = 0;
    let tokensLimit = tenantInfo?.tokens_limit || 300000;
    let nextRenewal = tenantInfo?.next_renewal_date || null;
    let planName = tenantInfo?.plan_name || 'Plan Pro';
    let price = tenantInfo?.price || 0;
    let allowExtra = tenantInfo?.allow_extra ?? false;
    let tenantName = tenantInfo?.tenant_name || '';
    let isActive = tenantInfo?.is_active ?? true;
    let tenantId = tenantInfo?.tenant_id || null;
    let logo: string | null = null;

    if (tenantInfo?.tenant_id) {
      const fullTenant = await this.tenantRepository.findOne({ where: { id: tenantInfo.tenant_id } });
      if (fullTenant) {
        logo = this.formatLogoUrl(fullTenant.logo);
      }
    }

    if (tenantInfo && nextRenewal) {
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
    }

    // 2. Conteo de documentos ingestados en RAG
    let documentsUsed = 0;
    try {
      const docRes = await this.dataSource.query(
        `SELECT COUNT(DISTINCT metadata->>'source') AS count FROM public.product_knowledge_base`
      );
      documentsUsed = docRes[0]?.count ? parseInt(docRes[0].count, 10) : 12;
    } catch (e) {
      documentsUsed = 12;
    }

    const documentsLimit = 101;

    const rawExtraTokens = tokensExtraUsed;
    const visibleTokensExtraUsed = allowExtra ? rawExtraTokens : 0;
    const overageAbsorbed = !allowExtra ? rawExtraTokens : 0;

    const tokensExtraLimit = allowExtra ? tokensLimit : 0;
    const totalTokensLimit = tokensLimit + tokensExtraLimit;
    const totalTokensConsumed = tokensUsed + rawExtraTokens;
    const extraPercentageUsed = tokensExtraLimit > 0 
      ? Math.min(100, Math.round((visibleTokensExtraUsed / tokensExtraLimit) * 100)) 
      : 0;

    return {
      tenant_id: tenantId,
      tenant_name: tenantName,
      schema_name: activeSchema,
      is_active: isActive,
      allow_extra: allowExtra,
      logo: logo,
      documents_used: documentsUsed,
      documents_limit: documentsLimit,
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

  async onModuleInit() {}

  async provision(dto: ProvisionTenantDto) {
    return this.tenantProvisioner.provisionTenant(dto);
  }

  async findAll() {
    const tenants = await this.tenantRepository.find({ relations: ['plan'], order: { created_at: 'DESC' } });
    return tenants.map((t) => {
      if (t.logo) {
        t.logo = this.formatLogoUrl(t.logo);
      }
      return t;
    });
  }

  async findOne(id: number) {
    const tenant = await this.tenantRepository.findOne({ where: { id }, relations: ['plan'] });
    if (!tenant) {
      throw new NotFoundException(`Tenant con ID ${id} no encontrado.`);
    }
    if (tenant.logo) {
      tenant.logo = this.formatLogoUrl(tenant.logo);
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
      if (dto.immediatePolicy === 'keep_current_date' && tenant.next_renewal_date && tenant.next_renewal_date > now) {
        // Conservar la fecha de renovación actual
      } else {
        // Reiniciar ciclo calculando desde ahora con protección de bisiestos y fin de mes
        const nextRenewal = addBillingMonths(now, months);
        tenant.next_renewal_date = nextRenewal;
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
    return this.tenantRepository.save(tenant);
  }

  async update(id: number, dto: { name?: string; is_active?: boolean; allow_extra?: boolean }) {
    const tenant = await this.findOne(id);
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.is_active !== undefined) tenant.is_active = dto.is_active;
    if (dto.allow_extra !== undefined) tenant.allow_extra = dto.allow_extra;
    return this.tenantRepository.save(tenant);
  }

  async remove(id: number) {
    const tenant = await this.findOne(id);
    const schemaName = tenant.schema_name;

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

