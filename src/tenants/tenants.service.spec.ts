import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantsService } from './tenants.service';
import { Tenant } from './entities/tenant.entity';
import { TenantRenewalQueue } from './entities/tenant-renewal-queue.entity';
import { TenantBillingCycle } from './entities/tenant-billing-cycle.entity';
import { User } from '../users/entities/user.entity';
import { Plan } from '../plans/entities/plan.entity';
import { TenantProvisionerService } from '../tenancy/tenant-provisioner.service';
import { SubscriptionValidatorService } from '../subscriptions/subscription-validator.service';
import { AudioAuditService } from '../subscriptions/audio-audit.service';

describe('TenantsService', () => {
  let service: TenantsService;
  let dataSourceMock: Partial<DataSource>;
  let tenantRepoMock: any;
  let subscriptionValidatorMock: any;
  let audioAuditMock: any;

  beforeEach(async () => {
    dataSourceMock = {
      query: jest.fn(),
    };
    tenantRepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };
    subscriptionValidatorMock = {
      getTenantPlanInfo: jest.fn(),
    };
    audioAuditMock = {
      getAudioUsageSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: tenantRepoMock,
        },
        {
          provide: getRepositoryToken(TenantRenewalQueue),
          useValue: {},
        },
        {
          provide: getRepositoryToken(TenantBillingCycle),
          useValue: {},
        },
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Plan),
          useValue: {},
        },
        {
          provide: TenantProvisionerService,
          useValue: {},
        },
        {
          provide: SubscriptionValidatorService,
          useValue: subscriptionValidatorMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: AudioAuditService,
          useValue: audioAuditMock,
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  describe('findAll', () => {
    it('should return consolidated tenants with total_queued_periods, coverage_until and ibm_audio_enabled in a single SQL query', async () => {
      const mockRawRows = [
        {
          id: 1,
          name: 'Mi Organización',
          schema_name: 'tenant_mi_org',
          plan_id: 3,
          next_renewal_date: '2026-10-15T00:00:00.000Z',
          is_active: true,
          allow_extra: false,
          ibm_audio_enabled: true,
          logo: null,
          created_at: '2026-01-10T12:00:00.000Z',
          total_queued_periods: 3,
          coverage_until: '2027-01-15T00:00:00.000Z',
          plan: {
            plan_id: 3,
            plan_name: 'Plan Corporativo',
            price: 149.0,
            tokens_limit: 500000,
            billing_period_months: 1,
            blnstatus: true,
            dtmcreated: '2026-01-01T00:00:00.000Z',
            dtmlastmodified: '2026-01-01T00:00:00.000Z',
          },
        },
        {
          id: 2,
          name: 'Org Sin Cola',
          schema_name: 'tenant_sin_cola',
          plan_id: 1,
          next_renewal_date: '2026-11-01T00:00:00.000Z',
          is_active: true,
          allow_extra: false,
          ibm_audio_enabled: false,
          logo: '/uploads/org2.png',
          created_at: '2026-02-10T12:00:00.000Z',
          total_queued_periods: 0,
          coverage_until: '2026-11-01T00:00:00.000Z',
          plan: {
            plan_id: 1,
            plan_name: 'Básico',
            price: 50.0,
            tokens_limit: 100000,
            billing_period_months: 1,
            blnstatus: true,
            dtmcreated: '2026-01-01T00:00:00.000Z',
            dtmlastmodified: '2026-01-01T00:00:00.000Z',
          },
        },
      ];

      (dataSourceMock.query as jest.Mock).mockResolvedValueOnce(mockRawRows);

      const result = await service.findAll();

      expect(dataSourceMock.query).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);

      expect(result[0]).toEqual({
        id: 1,
        name: 'Mi Organización',
        schema_name: 'tenant_mi_org',
        plan_id: 3,
        next_renewal_date: '2026-10-15T00:00:00.000Z',
        is_active: true,
        allow_extra: false,
        ibm_audio_enabled: true,
        logo: null,
        created_at: '2026-01-10T12:00:00.000Z',
        total_queued_periods: 3,
        coverage_until: '2027-01-15T00:00:00.000Z',
        plan: {
          plan_id: 3,
          plan_name: 'Plan Corporativo',
          price: 149.0,
          tokens_limit: 500000,
          billing_period_months: 1,
          blnstatus: true,
          dtmcreated: '2026-01-01T00:00:00.000Z',
          dtmlastmodified: '2026-01-01T00:00:00.000Z',
        },
      });

      expect(result[1].ibm_audio_enabled).toBe(false);
      expect(result[1].total_queued_periods).toBe(0);
      expect(result[1].coverage_until).toBe('2026-11-01T00:00:00.000Z');
      expect(result[1].logo).toContain('/uploads/org2.png');
    });
  });

  describe('findOne', () => {
    it('should attach total_queued_periods and coverage_until to tenant', async () => {
      const mockTenant: Partial<Tenant> = {
        id: 1,
        name: 'Mi Organización',
        next_renewal_date: new Date('2026-10-15T00:00:00.000Z'),
        is_active: true,
        ibm_audio_enabled: false,
        logo: null,
      };

      tenantRepoMock.findOne.mockResolvedValueOnce(mockTenant);
      (dataSourceMock.query as jest.Mock).mockResolvedValueOnce([
        {
          total_queued_periods: 2,
          total_months: 2,
        },
      ]);

      const result = await service.findOne(1);

      expect(result.total_queued_periods).toBe(2);
      expect(result.coverage_until).toBeDefined();
      expect(result.ibm_audio_enabled).toBe(false);
    });
  });

  describe('updateIbmAudio', () => {
    it('should enable and disable ibm_audio_enabled for a tenant', async () => {
      const mockTenant: Partial<Tenant> = {
        id: 7,
        name: 'Org Audio',
        schema_name: 'tenant_audio',
        ibm_audio_enabled: false,
        is_active: true,
        logo: null,
      };

      tenantRepoMock.findOne.mockResolvedValueOnce({ ...mockTenant });
      (dataSourceMock.query as jest.Mock).mockResolvedValueOnce([{ total_queued_periods: 0, total_months: 0 }]);
      tenantRepoMock.save.mockImplementationOnce(async (t: Tenant) => t);

      const enabledResult = await service.updateIbmAudio(7, true);
      expect(enabledResult.ibm_audio_enabled).toBe(true);
      expect(tenantRepoMock.save).toHaveBeenCalledWith(expect.objectContaining({ id: 7, ibm_audio_enabled: true }));
    });
  });

  describe('getCurrentTenant', () => {
    it('should expose audio_enabled=false when global provider is IBM (watsonx) and ibm_audio_enabled=false', async () => {
      subscriptionValidatorMock.getTenantPlanInfo.mockResolvedValueOnce({ tenant_id: 10, schema_name: 'tenant_demo' });
      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 10,
        name: 'Demo',
        schema_name: 'tenant_demo',
        ibm_audio_enabled: false,
        logo: null,
      });
      (dataSourceMock.query as jest.Mock).mockResolvedValueOnce([{ modelProvider: 'watsonx' }]);

      const result = await service.getCurrentTenant('tenant_demo');
      expect(result?.global_ai_provider).toBe('ibm');
      expect(result?.uses_ibm_stt).toBe(true);
      expect(result?.audio_enabled).toBe(false);
    });

    it('should expose audio_enabled=true when global provider is gemini even if ibm_audio_enabled=false', async () => {
      subscriptionValidatorMock.getTenantPlanInfo.mockResolvedValueOnce({ tenant_id: 10, schema_name: 'tenant_demo' });
      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 10,
        name: 'Demo',
        schema_name: 'tenant_demo',
        ibm_audio_enabled: false,
        logo: null,
      });
      (dataSourceMock.query as jest.Mock).mockResolvedValueOnce([{ modelProvider: 'gemini' }]);

      const result = await service.getCurrentTenant('tenant_demo');
      expect(result?.global_ai_provider).toBe('gemini');
      expect(result?.uses_ibm_stt).toBe(false);
      expect(result?.audio_enabled).toBe(true);
    });
  });
});
