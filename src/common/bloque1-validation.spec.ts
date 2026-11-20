import { BadRequestException, ExecutionContext, ForbiddenException, HttpStatus, Logger } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as jwt from 'jsonwebtoken';
import { QueryFailedError } from 'typeorm';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { authenticateTenantSocket, handleAuthorizedTenantRoom } from './utils/ws-tenant.util';
import { LoginValidationGuard } from '../auth/guards/login-validation.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { UsersService } from '../users/users.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Role } from '../role.enum';
import { TenantsController } from '../tenants/tenants.controller';
import { PlansController } from '../plans/plans.controller';
import { RagController } from '../rag/rag.controller';
import { NotificationsController } from '../notifications/notifications.controller';
import { AiAgentOrchestratorService } from '../conversations/ai-agent-orchestrator.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { ProvisionTenantDto } from '../tenants/dto/provision-tenant.dto';
import { CreatePlanDto } from '../plans/dto/create-plan.dto';
import { UpdateAiConfigDto } from '../conversations/dto/ai-config.dto';

describe('Bloque 1 - Pipe, Security, Auth, Users & SuperAdmin Hardening', () => {
  describe('GlobalExceptionFilter', () => {
    it('maps PostgreSQL 23505 to 409 Conflict and hides raw detail in production', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const filter = new GlobalExceptionFilter();
      const jsonMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      const host = {
        getType: () => 'http',
        switchToHttp: () => ({
          getResponse: () => ({ status: statusMock }),
          getRequest: () => ({ method: 'POST', url: '/api/clients' }),
        }),
      } as any;

      const err = new QueryFailedError('INSERT', [], { code: '23505', detail: 'Key (correo)=(a@b.com) exists' });
      filter.catch(err, host);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          message: 'Ya existe un registro con los mismos datos únicos.',
        }),
      );
      process.env.NODE_ENV = prevEnv;
    });

    it('ignores non-HTTP contexts safely instead of crashing on response.status', () => {
      const filter = new GlobalExceptionFilter();
      const host = { getType: () => 'ws' } as any;
      expect(() => filter.catch(new Error('ws error'), host)).not.toThrow();
    });
  });

  describe('WebSocket multi-tenant room isolation (ws-tenant.util)', () => {
    const logger = new Logger('WsTest');
    const prevSecret = process.env.JWT_SECRET;

    beforeEach(() => {
      process.env.JWT_SECRET = 'ws-test-secret';
    });

    afterAll(() => {
      process.env.JWT_SECRET = prevSecret;
    });

    it('blocks non-superadmin user from switching/joining another tenant room', () => {
      const token = jwt.sign({ sub: 'u-1', role: 'admin', tenant: 'tenant_uno' }, 'ws-test-secret');
      const socket: any = {
        id: 'sock-1',
        handshake: { auth: { token, tenantSchema: 'tenant_dos' }, headers: {}, query: {} },
        join: jest.fn(),
        leave: jest.fn(),
        disconnect: jest.fn(),
      };

      const ok = authenticateTenantSocket(socket, logger, 'Conversations');
      expect(ok).toBe(true);
      expect(socket.tenantSchema).toBe('tenant_uno');
      expect(socket.user).toEqual({ id: 'u-1', role: 'admin', tenantSchema: 'tenant_uno' });

      const forbiddenSet = handleAuthorizedTenantRoom(socket, logger, { tenantSchema: 'tenant_dos' }, 'set');
      expect(forbiddenSet).toEqual({ status: 'forbidden' });

      const forbiddenPublic = handleAuthorizedTenantRoom(socket, logger, { tenantSchema: 'public' }, 'join');
      expect(forbiddenPublic).toEqual({ status: 'forbidden' });
    });

    it('allows superadmin to switch across valid tenant schemas', () => {
      const token = jwt.sign({ sub: 'sa-1', role: 'superadmin', tenant: 'public' }, 'ws-test-secret');
      const socket: any = {
        id: 'sock-2',
        handshake: { auth: { token }, headers: {}, query: {} },
        join: jest.fn(),
        leave: jest.fn(),
        disconnect: jest.fn(),
      };

      expect(authenticateTenantSocket(socket, logger, 'Pipelines')).toBe(true);
      const res = handleAuthorizedTenantRoom(socket, logger, { tenantSchema: 'tenant_dos' }, 'set');
      expect(res).toEqual({ status: 'ok', room: 'tenant:tenant_dos' });
    });
  });

  describe('LoginValidationGuard & Auth/Users DTOs', () => {
    it('allows short legacy passwords on LoginDto while rejecting non-whitelisted properties', () => {
      const guard = new LoginValidationGuard();
      const makeCtx = (body: any): ExecutionContext =>
        ({
          switchToHttp: () => ({ getRequest: () => ({ body }) }),
        }) as any;

      expect(guard.canActivate(makeCtx({ email: ' user@test.com ', password: '123' }))).toBe(true);
      expect(() => guard.canActivate(makeCtx({ email: 'bad-email', password: '123' }))).toThrow(BadRequestException);
      expect(() => guard.canActivate(makeCtx({ email: 'user@test.com', password: '123', role: 'superadmin' }))).toThrow(BadRequestException);
    });

    it('allows empty/undefined password on UpdateUserDto but validates non-empty passwords', () => {
      const partialNoPass = plainToInstance(UpdateUserDto, { username: 'nuevo' });
      expect(validateSync(partialNoPass)).toHaveLength(0);

      const emptyPass = plainToInstance(UpdateUserDto, { username: 'nuevo', password: '' });
      expect(validateSync(emptyPass)).toHaveLength(0);

      const weakPass = plainToInstance(UpdateUserDto, { password: 'onlyletters' });
      expect(validateSync(weakPass).length).toBeGreaterThan(0);
    });
  });

  describe('UsersService privilege escalation, partial update & reset token fixes', () => {
    const buildUsersService = (mockQuery: jest.Mock) =>
      new UsersService({} as any, { query: mockQuery } as any);

    it('blocks creating a superadmin user when tenantSchema is not public', async () => {
      const mockQuery = jest.fn().mockResolvedValue([]);
      const usersService = buildUsersService(mockQuery);

      await expect(
        TenantContextService.run({ tenantSchema: 'tenant_acme', role: Role.Admin }, () =>
          usersService.create({
            username: 'evil',
            email: 'evil@acme.com',
            password: 'Password1',
            role: Role.SuperAdmin,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('builds partial UPDATE query without overwriting omitted fields with undefined', async () => {
      const mockQuery = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, username')) {
          return Promise.resolve([{ id: 'u-1', username: 'alice', email: 'alice@acme.com', role: 'admin', isActive: true }]);
        }
        return Promise.resolve([]);
      });
      const usersService = buildUsersService(mockQuery);

      await TenantContextService.run({ tenantSchema: 'tenant_acme' }, () =>
        usersService.update('u-1', { username: 'alice_updated' }),
      );

      const updateCall = mockQuery.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE "tenant_acme".users'));
      expect(updateCall).toBeDefined();
      expect(updateCall![0]).toContain('SET username = $1');
      expect(updateCall![0]).not.toContain('email =');
      expect(updateCall![1]).toEqual(['alice_updated', 'u-1']);
    });

    it('searches public schema in findOneByResetToken so SuperAdmin reset tokens work', async () => {
      const mockQuery = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM "public".users WHERE reset_password_token')) {
          return Promise.resolve([{ id: 'sa-1', email: 'sa@tibs.com.mx', role: 'superadmin' }]);
        }
        return Promise.resolve([]);
      });
      const usersService = buildUsersService(mockQuery);

      const user = await TenantContextService.run({ tenantSchema: 'public' }, () =>
        usersService.findOneByResetToken('reset-tok-123'),
      );
      expect(user).toBeTruthy();
      expect((user as any).tenantSchema).toBe('public');
    });
  });

  describe('SuperAdmin Guards, DTO bounds, Slug truncation & Global AI config protection', () => {
    it('enforces SuperAdminGuard & AuthGuard on sensitive controller routes', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, TenantsController)).toBeDefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, TenantsController.prototype.provision)).toContain(SuperAdminGuard);
      expect(Reflect.getMetadata(GUARDS_METADATA, TenantsController.prototype.remove)).toContain(SuperAdminGuard);
      expect(Reflect.getMetadata(GUARDS_METADATA, TenantsController.prototype.updatePlan)).toContain(SuperAdminGuard);
      expect(Reflect.getMetadata(GUARDS_METADATA, PlansController.prototype.create)).toContain(SuperAdminGuard);
      expect(Reflect.getMetadata(GUARDS_METADATA, PlansController)).toBeDefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, RagController)).toBeDefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, NotificationsController.prototype.triggerTest)).toContain(SuperAdminGuard);
    });

    it('truncates generated tenant slugs to <= 63 chars so PostgreSQL identifiers stay valid', () => {
      const slug = TenantContextService.generateSlug('Organización Corporativa Internacional De Servicios Tecnológicos Avanzados SA de CV');
      expect(slug.length).toBeLessThanOrEqual(63);
      expect(TenantContextService.validateSchemaName(slug)).toBe(true);
    });

    it('validates ProvisionTenantDto, CreatePlanDto & UpdateAiConfigDto limits', () => {
      const badTenant = plainToInstance(ProvisionTenantDto, {
        tenantName: 'A'.repeat(260),
        adminUsername: 'adm',
        adminEmail: 'bad',
        billingPeriodMonths: 99,
      });
      expect(validateSync(badTenant).length).toBeGreaterThan(0);

      const badPlan = plainToInstance(CreatePlanDto, {
        plan_name: 'Pro',
        price: 100,
        tokens_limit: 5000.5,
        billing_period_months: 61,
      });
      expect(validateSync(badPlan).length).toBeGreaterThan(0);

      const badAiConfig = plainToInstance(UpdateAiConfigDto, {
        temperature: 1.5,
        historyMessageLimit: 2,
        maxNewTokens: 50,
        openaiEndpoint: 'notaurl',
      });
      expect(validateSync(badAiConfig).length).toBeGreaterThan(0);
    });

    it('blocks non-superadmin users from updating global AI provider/credentials', async () => {
      const orchestrator = new AiAgentOrchestratorService(
        { manager: { query: jest.fn() }, findOne: jest.fn(), create: jest.fn(), merge: jest.fn(), save: jest.fn() } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(
        orchestrator.saveConfig(
          { modelProvider: 'openai', openaiApiKey: 'sk-hijack' },
          { id: 'u-admin', role: Role.Admin },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
