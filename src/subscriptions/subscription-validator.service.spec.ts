import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';
import { SubscriptionValidatorService } from './subscription-validator.service';

describe('SubscriptionValidatorService', () => {
  let service: SubscriptionValidatorService;
  let dataSourceMock: { query: jest.Mock };

  beforeEach(async () => {
    dataSourceMock = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionValidatorService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<SubscriptionValidatorService>(SubscriptionValidatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkSubscriptionLimits', () => {
    const defaultTenantInfo = {
      id: 1,
      name: 'Demo Org',
      schema_name: 'tenant_demo',
      plan_id: 1,
      next_renewal_date: new Date(Date.now() + 86400000 * 20), // 20 days in future
      is_active: true,
      allow_extra: false,
      logo: null,
      plan_name: 'Básico',
      price: 200,
      tokens_limit: 100000,
      billing_period_months: 1,
      blnstatus: true,
    };

    it('should allow call when within base plan limit', async () => {
      // 1. getTenantPlanInfo
      dataSourceMock.query.mockResolvedValueOnce([defaultTenantInfo]);
      // 2. getTokensConsumptionInPeriod
      dataSourceMock.query.mockResolvedValueOnce([
        { base_total: '50000', extra_total: '0', total_accumulated: '50000' },
      ]);

      const result = await service.checkSubscriptionLimits('tenant_demo');
      expect(result).toEqual({ is_extra: false });
    });

    it('should reject call when base limit is reached (100%) and allow_extra is false', async () => {
      dataSourceMock.query.mockResolvedValueOnce([defaultTenantInfo]);
      dataSourceMock.query.mockResolvedValueOnce([
        { base_total: '100000', extra_total: '0', total_accumulated: '100000' },
      ]);

      await expect(service.checkSubscriptionLimits('tenant_demo')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.PAYMENT_REQUIRED,
          response: expect.objectContaining({
            code: 'TOKENS_LIMIT_EXCEEDED',
          }),
        })
      );
    });

    it('should reject call when base limit is exceeded (courtesy overflow) and allow_extra is false', async () => {
      dataSourceMock.query.mockResolvedValueOnce([defaultTenantInfo]);
      dataSourceMock.query.mockResolvedValueOnce([
        { base_total: '102000', extra_total: '0', total_accumulated: '102000' },
      ]);

      await expect(service.checkSubscriptionLimits('tenant_demo')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.PAYMENT_REQUIRED,
          response: expect.objectContaining({
            code: 'TOKENS_LIMIT_EXCEEDED',
          }),
        })
      );
    });

    it('should allow extra consumption when base is exceeded but extra margin is not exhausted', async () => {
      const extraTenantInfo = { ...defaultTenantInfo, allow_extra: true };
      dataSourceMock.query.mockResolvedValueOnce([extraTenantInfo]);
      dataSourceMock.query.mockResolvedValueOnce([
        { base_total: '102000', extra_total: '45000', total_accumulated: '147000' },
      ]);

      const result = await service.checkSubscriptionLimits('tenant_demo');
      expect(result).toEqual({ is_extra: true });
    });

    it('should REJECT when extra consumption reached exactly 100% (100,000 / 100,000)', async () => {
      const extraTenantInfo = { ...defaultTenantInfo, allow_extra: true };
      dataSourceMock.query.mockResolvedValueOnce([extraTenantInfo]);
      dataSourceMock.query.mockResolvedValueOnce([
        { base_total: '100000', extra_total: '100000', total_accumulated: '200000' },
      ]);

      await expect(service.checkSubscriptionLimits('tenant_demo')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.PAYMENT_REQUIRED,
          response: expect.objectContaining({
            code: 'EXTRA_TOKENS_LIMIT_EXCEEDED',
          }),
        })
      );
    });

    it('should REJECT when extra consumption exceeded 100% and has courtesy overflow (e.g. 203,577 tokens)', async () => {
      const extraTenantInfo = { ...defaultTenantInfo, allow_extra: true };
      dataSourceMock.query.mockResolvedValueOnce([extraTenantInfo]);
      dataSourceMock.query.mockResolvedValueOnce([
        { base_total: '100000', extra_total: '203577', total_accumulated: '303577' },
      ]);

      await expect(service.checkSubscriptionLimits('tenant_demo')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.PAYMENT_REQUIRED,
          response: expect.objectContaining({
            code: 'EXTRA_TOKENS_LIMIT_EXCEEDED',
          }),
        })
      );
    });

    it('should REJECT when estimatedTokens causes extra consumption to exceed maxExtraTokens', async () => {
      const extraTenantInfo = { ...defaultTenantInfo, allow_extra: true };
      dataSourceMock.query.mockResolvedValueOnce([extraTenantInfo]);
      dataSourceMock.query.mockResolvedValueOnce([
        { base_total: '100000', extra_total: '95000', total_accumulated: '195000' },
      ]);

      // estimatedTokens is 6,000 (95,000 + 6,000 = 101,000 > 100,000)
      await expect(service.checkSubscriptionLimits('tenant_demo', 6000)).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.PAYMENT_REQUIRED,
          response: expect.objectContaining({
            code: 'EXTRA_TOKENS_LIMIT_EXCEEDED',
          }),
        })
      );
    });
  });
});
