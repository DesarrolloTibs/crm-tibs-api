import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { Role } from '../role.enum';

describe('SuperAdminGuard & TenantsController Audio Access Control', () => {
  let guard: SuperAdminGuard;
  let controller: TenantsController;
  let tenantsServiceMock: jest.Mocked<Partial<TenantsService>>;

  const makeCtx = (role: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u1', role } }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new SuperAdminGuard();
    tenantsServiceMock = {
      updateIbmAudio: jest.fn().mockResolvedValue({ id: 1, ibm_audio_enabled: true } as any),
      update: jest.fn().mockResolvedValue({ id: 1, ibm_audio_enabled: true } as any),
      getAudioUsageReport: jest.fn().mockResolvedValue({ summary: { total_seconds: 12 } } as any),
    };
    controller = new TenantsController(tenantsServiceMock as TenantsService);
  });

  describe('SuperAdminGuard', () => {
    it('allows superadmin role', () => {
      expect(guard.canActivate(makeCtx(Role.SuperAdmin))).toBe(true);
    });

    it('rejects admin and executive roles with ForbiddenException', () => {
      expect(() => guard.canActivate(makeCtx(Role.Admin))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(makeCtx(Role.Executive))).toThrow(ForbiddenException);
    });
  });

  describe('TenantsController.update', () => {
    it('blocks non-superadmin trying to modify ibm_audio_enabled via PUT /tenants/:id', async () => {
      await expect(
        controller.update(1, { id: 'u-admin', role: Role.Admin } as any, { ibm_audio_enabled: true }),
      ).rejects.toThrow(ForbiddenException);
      expect(tenantsServiceMock.update).not.toHaveBeenCalled();
    });

    it('allows superadmin to modify ibm_audio_enabled via PUT /tenants/:id', async () => {
      await controller.update(1, { id: 'u-sa', role: Role.SuperAdmin } as any, { ibm_audio_enabled: true });
      expect(tenantsServiceMock.update).toHaveBeenCalledWith(1, { ibm_audio_enabled: true });
    });

    it('delegates PUT /tenants/:id/ibm-audio to updateIbmAudio', async () => {
      await controller.updateIbmAudio(1, { ibm_audio_enabled: true });
      expect(tenantsServiceMock.updateIbmAudio).toHaveBeenCalledWith(1, true);
    });
  });
});
