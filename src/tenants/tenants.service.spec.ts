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

describe('TenantsService', () => {
  let service: TenantsService;
  let dataSourceMock: Partial<DataSource>;
  let tenantRepoMock: any;

  beforeEach(async () => {
    dataSourceMock = {
      query: jest.fn(),
    };
    tenantRepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
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
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  describe('findAll', () => {
    it('should return consolidated tenants with total_queued_periods and coverage_until in a single SQL query', async () => {
      const mockRawRows = [
        {
          id: 1,
          name: 'Mi Organización',
          schema_name: 'tenant_mi_org',
          plan_id: 3,
          next_renewal_date: '2026-10-15T00:00:00.000Z',
          is_active: true,
          allow_extra: false,
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
    });
  });
});
