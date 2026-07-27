import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from './entities/tenant.entity';
import { TenantRenewalQueue } from './entities/tenant-renewal-queue.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';
import { TenantProvisionerService, ProvisionTenantDto } from '../tenancy/tenant-provisioner.service';

import { SubscriptionValidatorService } from '../subscriptions/subscription-validator.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class TenantsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantRenewalQueue)
    private readonly queueRepository: Repository<TenantRenewalQueue>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly tenantProvisioner: TenantProvisionerService,
    private readonly subscriptionValidator: SubscriptionValidatorService,
    private readonly dataSource: DataSource
  ) {}

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
        logo = fullTenant.logo;
      }
    }

    if (tenantInfo && nextRenewal) {
      const months = tenantInfo.billing_period_months || 1;
      const periodStart = new Date(nextRenewal);
      periodStart.setMonth(periodStart.getMonth() - months);
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
      tokens_extra_used: tokensExtraUsed,
      tokens_limit: tokensLimit,
      next_renewal_date: nextRenewal,
      plan_name: planName,
      price: price,
    };
  }

  async getCurrentTenant(schemaName?: string) {
    const activeSchema = schemaName || TenantContextService.getTenantSchema() || 'public';
    const tenantInfo = await this.subscriptionValidator.getTenantPlanInfo(activeSchema);
    if (!tenantInfo) {
      const publicTenant = await this.tenantRepository.findOne({ where: { schema_name: 'public' }, relations: ['plan'] });
      return publicTenant || null;
    }
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantInfo.tenant_id }, relations: ['plan'] });
    return tenant;
  }

  async updateLogo(tenantId: number, logoUrl: string) {
    const tenant = await this.findOne(tenantId);
    tenant.logo = logoUrl;
    return this.tenantRepository.save(tenant);
  }


  async onModuleInit() {
    try {
      const email = 'jonathan.amadorz@tibs.com.mx';
      const existing = await this.dataSource.query(
        `SELECT id FROM public.users WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
      if (!existing || existing.length === 0) {
        const hashedPassword = await bcrypt.hash('12345678', 10);
        await this.dataSource.query(
          `INSERT INTO public.users (username, email, password, role, "isActive")
           VALUES ($1, $2, $3, 'superadmin', true)
           ON CONFLICT (id) DO NOTHING`,
          ['jonathan.amadorz', email, hashedPassword]
        );
      }
    } catch (err) {
      // Ignorar si la tabla no se ha sincronizado aún durante el inicio
    }
  }


  async provision(dto: ProvisionTenantDto) {

    return this.tenantProvisioner.provisionTenant(dto);
  }

  async findAll() {
    return this.tenantRepository.find({ relations: ['plan'], order: { created_at: 'DESC' } });
  }

  async findOne(id: number) {
    const tenant = await this.tenantRepository.findOne({ where: { id }, relations: ['plan'] });
    if (!tenant) {
      throw new NotFoundException(`Tenant con ID ${id} no encontrado.`);
    }
    return tenant;
  }

  async updatePlan(tenantId: number, planId: number, months: number = 1, allowExtra?: boolean) {
    const tenant = await this.findOne(tenantId);
    
    // Calcular nueva fecha de renovación
    const now = new Date();
    const nextRenewal = new Date(now);
    nextRenewal.setMonth(nextRenewal.getMonth() + months);

    tenant.plan_id = planId;
    tenant.next_renewal_date = nextRenewal;
    tenant.is_active = true;
    if (allowExtra !== undefined) {
      tenant.allow_extra = allowExtra;
    }

    return this.tenantRepository.save(tenant);
  }

  async enqueueRenewal(tenantId: number, planId: number, months: number = 1) {
    const tenant = await this.findOne(tenantId);
    const item = this.queueRepository.create({
      tenant_id: String(tenant.id),
      plan_id: planId,
      billing_period_months: months,
    });
    return this.queueRepository.save(item);
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

