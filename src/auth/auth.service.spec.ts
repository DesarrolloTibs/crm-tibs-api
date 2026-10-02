import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { ConfigService } from '@nestjs/config';

const mockUsersService = {
  findOneByEmail: jest.fn(),
  findOneByResetToken: jest.fn(),
  save: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn().mockReturnValue({ sub: 'u1', username: 'alice', role: 'admin', tenant: 'tenant_demo', type: 'refresh' }),
};

const mockMailService: Partial<MailService> = {
  sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
};

const mockDataSource = {
  query: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'JWT_SECRET') return 'test_secret';
    if (key === 'JWT_REFRESH_SECRET') return 'test_refresh_secret';
    if (key === 'JWT_REFRESH_EXPIRATION_TIME') return '30d';
    return null;
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ── validateUser ─────────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('returns null when no superadmin and no local user match', async () => {
      mockDataSource.query.mockResolvedValue([]);
      mockUsersService.findOneByEmail.mockResolvedValue(null);

      const result = await service.validateUser('unknown@example.com', 'pass');
      expect(result).toBeNull();
    });

    it('returns user when local tenant user password matches', async () => {
      const hashed = await bcrypt.hash('secret', 10);
      const fakeUser = { id: 'u1', username: 'alice', email: 'alice@test.com', password: hashed, role: 'admin', isActive: true };
      
      mockDataSource.query.mockImplementation((sql: string) => {
        if (sql.includes('public.users')) return Promise.resolve([]);
        if (sql.includes('public.tenants')) return Promise.resolve([{ schema_name: 'tenant_demo' }]);
        if (sql.includes('users WHERE LOWER(email)')) return Promise.resolve([fakeUser]);
        return Promise.resolve([]);
      });

      const result = await service.validateUser('alice@test.com', 'secret');
      expect(result).not.toBeNull();
      expect(result.username).toBe('alice');
      expect(result.tenant).toBe('tenant_demo');
    });

    it('returns null when local user password does not match', async () => {
      const hashed = await bcrypt.hash('correct', 10);
      const fakeUser = { id: 'u1', username: 'alice', email: 'alice@test.com', password: hashed, role: 'admin', isActive: true };

      mockDataSource.query.mockImplementation((sql: string) => {
        if (sql.includes('public.users')) return Promise.resolve([]);
        if (sql.includes('public.tenants')) return Promise.resolve([{ schema_name: 'tenant_demo' }]);
        if (sql.includes('users WHERE LOWER(email)')) return Promise.resolve([fakeUser]);
        return Promise.resolve([]);
      });

      const result = await service.validateUser('alice@test.com', 'wrong');
      expect(result).toBeNull();
    });

    it('throws BadRequestException when local user is inactive', async () => {
      const fakeUser = { id: 'u1', username: 'alice', email: 'alice@test.com', password: 'x', role: 'admin', isActive: false };

      mockDataSource.query.mockImplementation((sql: string) => {
        if (sql.includes('public.users')) return Promise.resolve([]);
        if (sql.includes('public.tenants')) return Promise.resolve([{ schema_name: 'tenant_demo' }]);
        if (sql.includes('users WHERE LOWER(email)')) return Promise.resolve([fakeUser]);
        return Promise.resolve([]);
      });

      await expect(service.validateUser('alice@test.com', 'pass')).rejects.toThrow(BadRequestException);
    });

    it('returns superadmin when public.users row matches', async () => {
      const hashed = await bcrypt.hash('adminpass', 10);
      mockDataSource.query.mockResolvedValue([{
        id: 'sa1', username: 'superadmin', email: 'sa@test.com', password: hashed, role: 'superadmin', isActive: true,
      }]);

      const result = await service.validateUser('sa@test.com', 'adminpass');
      expect(result).not.toBeNull();
      expect(result.role).toBe('superadmin');
      expect(result.tenant).toBe('public');
    });
  });

  // ── login ────────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns access_token, refresh_token and user info', async () => {
      const user = { id: 'u1', username: 'alice', email: 'alice@test.com', role: 'admin', tenant: 'tenant_demo' };
      const result = await service.login(user);
      expect(result.access_token).toBe('mock.jwt.token');
      expect(result.refresh_token).toBe('mock.jwt.token');
      expect(result.role).toBe('admin');
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('alice');
      expect(mockJwtService.sign).toHaveBeenCalled();
    });
  });

  // ── refreshToken ─────────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('successfully refreshes token for active user', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'u1',
        username: 'alice',
        role: 'admin',
        tenant: 'tenant_demo',
        type: 'refresh',
      });

      mockDataSource.query.mockImplementation((sql: string) => {
        if (sql.includes('public.tenants')) return Promise.resolve([{ is_active: true }]);
        if (sql.includes('users WHERE id')) return Promise.resolve([{
          id: 'u1',
          username: 'alice',
          email: 'alice@test.com',
          role: 'admin',
          isActive: true,
        }]);
        return Promise.resolve([]);
      });

      const result = await service.refreshToken('valid.refresh.token');
      expect(result).toBeDefined();
      expect(result.access_token).toBe('mock.jwt.token');
      expect(result.refresh_token).toBe('mock.jwt.token');
      expect(result.user.username).toBe('alice');
    });
  });

  // ── forgotPassword ───────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('does not throw when user is not found', async () => {
      mockUsersService.findOneByEmail.mockResolvedValue(null);
      await expect(service.forgotPassword('nobody@test.com')).resolves.not.toThrow();
    });

    it('saves token and sends email when user exists', async () => {
      const user = { id: 'u1', email: 'alice@test.com', username: 'alice', resetPasswordToken: null, resetPasswordExpires: null };
      mockUsersService.findOneByEmail.mockResolvedValue(user);
      mockUsersService.save.mockResolvedValue(user);

      await service.forgotPassword('alice@test.com');

      expect(mockUsersService.save).toHaveBeenCalled();
      expect(mockMailService.sendResetPasswordEmail).toHaveBeenCalledWith(
        'alice@test.com', expect.any(String), 'alice',
      );
    });
  });

  // ── resetPassword ────────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('throws BadRequestException when token is invalid or expired', async () => {
      mockUsersService.findOneByResetToken.mockResolvedValue(null);
      await expect(service.resetPassword('bad-token', 'newpass')).rejects.toThrow(BadRequestException);
    });

    it('updates password and clears token when valid', async () => {
      const future = new Date(Date.now() + 60_000);
      const user = { password: 'old', resetPasswordToken: 'tok', resetPasswordExpires: future };
      mockUsersService.findOneByResetToken.mockResolvedValue(user);
      mockUsersService.save.mockResolvedValue(user);

      await service.resetPassword('tok', 'newSecret123');

      expect(mockUsersService.save).toHaveBeenCalled();
      expect(user.resetPasswordToken).toBeNull();
      expect(user.resetPasswordExpires).toBeNull();
      expect(await bcrypt.compare('newSecret123', user.password)).toBe(true);
    });
  });
});
