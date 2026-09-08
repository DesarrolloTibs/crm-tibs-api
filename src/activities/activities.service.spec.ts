import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivitiesService } from './activities.service';
import { Activity } from './entities/activity.entity';
import { TypeActivity } from './entities/type-activity.entity';
import { Client } from '../clients/entities/client.entity';
import { UsersService } from '../users/users.service';
import { InteractionsService } from '../interactions/interactions.service';
import { RemindersService } from '../reminders/reminders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivitiesGateway } from './activities.gateway';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';

describe('ActivitiesService - Client Notice with ICS', () => {
  let service: ActivitiesService;
  let mockActivityRepo: any;
  let mockTypeActivityRepo: any;
  let mockClientRepo: any;
  let mockUsersService: any;
  let mockInteractionsService: any;
  let mockRemindersService: any;
  let mockNotificationsService: any;
  let mockEventEmitter: any;
  let mockActivitiesGateway: any;
  let mockMailService: any;

  const mockUser: User = {
    id: 'user-111',
    username: 'asesor_demo',
    role: Role.Executive,
  } as User;

  beforeEach(async () => {
    mockActivityRepo = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 'act-123' })),
      save: jest.fn().mockImplementation((act) => Promise.resolve({ ...act, id: 'act-123' })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockTypeActivityRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 1, strname: 'Reunión' }),
    };

    mockClientRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };

    mockUsersService = {
      findOneById: jest.fn().mockResolvedValue(mockUser),
    };

    mockInteractionsService = {
      create: jest.fn().mockResolvedValue({}),
    };

    mockRemindersService = {
      upsertForActivity: jest.fn().mockResolvedValue({}),
      findByActivity: jest.fn().mockResolvedValue(null),
    };

    mockNotificationsService = {
      createAndSendNotification: jest.fn().mockResolvedValue({}),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockActivitiesGateway = {
      emitActivityCreated: jest.fn(),
    };

    mockMailService = {
      sendActivityNoticeToClient: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        { provide: getRepositoryToken(Activity), useValue: mockActivityRepo },
        { provide: getRepositoryToken(TypeActivity), useValue: mockTypeActivityRepo },
        { provide: getRepositoryToken(Client), useValue: mockClientRepo },
        { provide: UsersService, useValue: mockUsersService },
        { provide: InteractionsService, useValue: mockInteractionsService },
        { provide: RemindersService, useValue: mockRemindersService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ActivitiesGateway, useValue: mockActivitiesGateway },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<ActivitiesService>(ActivitiesService);
  });

  it('debe enviar correo de aviso con .ics al cliente asignado cuando tiene correo', async () => {
    const activityDate = new Date('2026-10-15T10:00:00Z');
    const createdActivity = {
      id: 'act-123',
      activity: 'Demostración de CRM Tibs',
      date: activityDate,
      typeActivityId: 1,
      typeActivity: { id: 1, strname: 'Reunión' },
      user: mockUser,
      client: {
        id: 'client-1',
        nombre: 'Juan',
        apellido: 'Pérez',
        correo: 'juan.perez@empresa.com',
      },
      contacts: [],
      company: {
        id: 'comp-1',
        nombre: 'Tecnologías Globales',
      },
    };

    mockActivityRepo.findOne.mockResolvedValue(createdActivity);

    const result = await service.create(
      {
        activity: 'Demostración de CRM Tibs',
        date: activityDate,
        typeActivityId: 1,
        clientId: 'client-1',
      } as any,
      mockUser,
    );

    expect(result).toBeDefined();
    expect(mockMailService.sendActivityNoticeToClient).toHaveBeenCalledTimes(1);
    expect(mockMailService.sendActivityNoticeToClient).toHaveBeenCalledWith(
      'juan.perez@empresa.com',
      'Juan Pérez',
      'Demostración de CRM Tibs',
      'Reunión',
      activityDate,
      'asesor_demo',
      'Tecnologías Globales',
      undefined,
    );
  });

  it('debe enviar aviso a contactos cuando la actividad tiene lista de contactos con correo', async () => {
    const activityDate = new Date('2026-10-16T15:30:00Z');
    const createdActivity = {
      id: 'act-124',
      activity: 'Revisión de propuesta técnica',
      date: activityDate,
      typeActivityId: 1,
      typeActivity: { id: 1, strname: 'Reunión' },
      user: mockUser,
      client: null,
      contacts: [
        { id: 'c-1', nombre: 'María', apellido: 'Gómez', correo: 'maria@empresa.com' },
        { id: 'c-2', nombre: 'Carlos', apellido: 'Ruiz', correo: 'carlos@empresa.com' },
      ],
      company: null,
    };

    mockActivityRepo.findOne.mockResolvedValue(createdActivity);

    await service.create(
      {
        activity: 'Revisión de propuesta técnica',
        date: activityDate,
        contactIds: ['c-1', 'c-2'],
      } as any,
      mockUser,
    );

    expect(mockMailService.sendActivityNoticeToClient).toHaveBeenCalledTimes(2);
    expect(mockMailService.sendActivityNoticeToClient).toHaveBeenCalledWith(
      'maria@empresa.com',
      'María Gómez',
      'Revisión de propuesta técnica',
      'Reunión',
      activityDate,
      'asesor_demo',
      undefined,
      undefined,
    );
    expect(mockMailService.sendActivityNoticeToClient).toHaveBeenCalledWith(
      'carlos@empresa.com',
      'Carlos Ruiz',
      'Revisión de propuesta técnica',
      'Reunión',
      activityDate,
      'asesor_demo',
      undefined,
      undefined,
    );
  });

  it('no debe enviar correo si ni cliente ni contactos tienen correo asignado', async () => {
    const activityDate = new Date('2026-10-17T11:00:00Z');
    const createdActivity = {
      id: 'act-125',
      activity: 'Llamada rápida',
      date: activityDate,
      typeActivityId: null,
      typeActivity: null,
      user: mockUser,
      client: { id: 'c-sin-correo', nombre: 'Sin Correo', apellido: '', correo: null },
      contacts: [],
    };

    mockActivityRepo.findOne.mockResolvedValue(createdActivity);

    await service.create(
      {
        activity: 'Llamada rápida',
        date: activityDate,
        clientId: 'c-sin-correo',
      } as any,
      mockUser,
    );

    expect(mockMailService.sendActivityNoticeToClient).not.toHaveBeenCalled();
  });

  it('si el envío de correo falla, no interrumpe la creación de la actividad', async () => {
    const activityDate = new Date('2026-10-18T09:00:00Z');
    const createdActivity = {
      id: 'act-126',
      activity: 'Seguimiento post-venta',
      date: activityDate,
      typeActivityId: 1,
      typeActivity: { id: 1, strname: 'Seguimiento' },
      user: mockUser,
      client: { id: 'c-1', nombre: 'Ana', apellido: 'López', correo: 'ana@empresa.com' },
      contacts: [],
    };

    mockActivityRepo.findOne.mockResolvedValue(createdActivity);
    mockMailService.sendActivityNoticeToClient.mockRejectedValue(new Error('SMTP Connection timeout'));

    const result = await service.create(
      {
        activity: 'Seguimiento post-venta',
        date: activityDate,
        clientId: 'c-1',
      } as any,
      mockUser,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe('act-126');
  });
});
