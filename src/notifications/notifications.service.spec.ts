import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { MailService } from '../mail/mail.service';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { ConfigService } from '@nestjs/config';

const mockNotificationRepo = {
  query: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
};

const mockUserRepo = {
  findOne: jest.fn(),
};

const mockGateway: Partial<NotificationsGateway> = {
  emitNotificationToUser: jest.fn(),
};

const mockMailService: Partial<MailService> = {
  sendGeneralNotificationEmail: jest.fn().mockResolvedValue(undefined),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('http://localhost:3000'),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: mockNotificationRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: NotificationsGateway, useValue: mockGateway },
        { provide: MailService, useValue: mockMailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  // ── createAndSendNotification ─────────────────────────────────────────────

  describe('createAndSendNotification', () => {
    it('returns null when userId is null — no notification created', async () => {
      const result = await service.createAndSendNotification(null, 'Test', 'msg', 'info');
      expect(result).toBeNull();
      expect(mockNotificationRepo.save).not.toHaveBeenCalled();
    });

    it('returns null when userId is undefined', async () => {
      const result = await service.createAndSendNotification(undefined, 'Test', 'msg', 'info');
      expect(result).toBeNull();
    });

    it('creates and returns notification when userId is valid', async () => {
      mockNotificationRepo.query.mockResolvedValue(undefined);
      const fakeNotif = { id: 'n1', title: 'Test', message: 'msg', type: 'info', read: false };
      mockNotificationRepo.create.mockReturnValue(fakeNotif);
      mockNotificationRepo.save.mockResolvedValue(fakeNotif);
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', email: 'user@test.com', username: 'alice' });

      const result = await service.createAndSendNotification('u1', 'Test', 'msg', 'info');
      expect(result).toMatchObject({ id: 'n1' });
      expect(mockNotificationRepo.save).toHaveBeenCalledTimes(1);
    });

    it('does NOT send email when sendEmail=false', async () => {
      mockNotificationRepo.query.mockResolvedValue(undefined);
      const fakeNotif = { id: 'n2', title: 'T', message: 'm', type: 'info', read: false };
      mockNotificationRepo.create.mockReturnValue(fakeNotif);
      mockNotificationRepo.save.mockResolvedValue(fakeNotif);
      mockUserRepo.findOne.mockResolvedValue({ id: 'u1', email: 'u@test.com', username: 'bob' });

      await service.createAndSendNotification('u1', 'T', 'm', 'info', undefined, false);
      expect(mockMailService.sendGeneralNotificationEmail).not.toHaveBeenCalled();
    });
  });

  // ── handleCreateAndSend event ─────────────────────────────────────────────

  describe('handleCreateAndSend (EventEmitter event handler)', () => {
    it('delegates to createAndSendNotification', async () => {
      const spy = jest
        .spyOn(service, 'createAndSendNotification')
        .mockResolvedValue(null);

      await service.handleCreateAndSendNotification({
        userId: 'u1',
        title: 'Event Test',
        message: 'hello',
        type: 'info',
        entityId: undefined,
        sendEmail: true,
      });

      expect(spy).toHaveBeenCalledWith('u1', 'Event Test', 'hello', 'info', undefined, true);
    });
  });
});
