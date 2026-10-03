import { WebchatActionExecutorService } from './webchat-action-executor.service';
import { Role } from '../../role.enum';
import { User } from '../../users/entities/user.entity';

describe('WebchatActionExecutorService', () => {
  let service: WebchatActionExecutorService;

  let mockOpportunitiesService: any;
  let mockActivitiesService: any;
  let mockTicketsService: any;
  let mockClientsService: any;
  let mockCompaniesService: any;
  let mockUsersService: any;

  let mockBusinessLineRepo: any;
  let mockDeliveryTypeRepo: any;
  let mockLicensingRepo: any;
  let mockOpportunityLabelRepo: any;
  let mockTypeActivityRepo: any;
  let mockClientRepo: any;
  let mockCompanyRepo: any;
  let mockOpportunityRepo: any;
  let mockActivityRepo: any;
  let mockTicketRepo: any;
  let mockProductRepo: any;
  let mockStageRepo: any;

  const adminUser: User = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'admin_user',
    role: Role.Admin,
  } as User;

  const executiveUser: User = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'exec_user',
    role: Role.Executive,
  } as User;

  const otherExecutiveUser: User = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'carlos_asesor',
    role: Role.Executive,
  } as User;

  beforeEach(() => {
    mockOpportunitiesService = {
      create: jest.fn(),
      update: jest.fn(),
    };

    mockActivitiesService = {
      create: jest.fn(),
      update: jest.fn(),
      findAllTypes: jest.fn().mockResolvedValue([
        { id: 1, strname: 'Reunión' },
        { id: 2, strname: 'Llamada' },
      ]),
      findByUserAndDate: jest.fn().mockResolvedValue([]),
    };

    mockTicketsService = {
      create: jest.fn(),
    };

    mockClientsService = {};
    mockCompaniesService = {};

    mockUsersService = {
      findOneById: jest.fn().mockImplementation((id: string) => {
        if (id === otherExecutiveUser.id) return Promise.resolve(otherExecutiveUser);
        if (id === executiveUser.id) return Promise.resolve(executiveUser);
        return Promise.resolve(adminUser);
      }),
      findAllActive: jest.fn().mockResolvedValue([adminUser, executiveUser, otherExecutiveUser]),
    };

    mockBusinessLineRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'bl-default-uuid', strname: 'Desarrollo' }),
      find: jest.fn().mockResolvedValue([{ id: 'bl-default-uuid', strname: 'Desarrollo' }]),
    };

    mockDeliveryTypeRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'dt-default-uuid', strname: 'Proyecto' }),
      find: jest.fn().mockResolvedValue([{ id: 'dt-default-uuid', strname: 'Proyecto' }]),
    };

    mockLicensingRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'lic-default-uuid', strname: 'Anual' }),
      find: jest.fn().mockResolvedValue([{ id: 'lic-default-uuid', strname: 'Anual' }]),
    };

    mockOpportunityLabelRepo = {
      find: jest.fn().mockResolvedValue([
        { field_key: 'linea_negocio', strname: 'División de Negocio', blnstatus: true },
        { field_key: 'tipo_entrega', strname: 'Modalidad de Entrega', blnstatus: true },
        { field_key: 'licenciamiento', strname: 'Tipo de Licenciamiento', blnstatus: true },
      ]),
      findOne: jest.fn(),
    };

    mockTypeActivityRepo = {
      findOne: jest.fn().mockImplementation((args: any) => {
        const str = args?.where?.strname?._value;
        if (str && str.includes('Demostraci')) return Promise.resolve({ id: 4, strname: 'Demostración' });
        if (str && str.includes('Llamada')) return Promise.resolve({ id: 2, strname: 'Llamada' });
        if (str && str.includes('Visita')) return Promise.resolve({ id: 3, strname: 'Visita' });
        return Promise.resolve({ id: 1, strname: 'Reunión' });
      }),
      find: jest.fn().mockResolvedValue([
        { id: 1, strname: 'Reunión' },
        { id: 2, strname: 'Llamada' },
        { id: 3, strname: 'Visita' },
        { id: 4, strname: 'Demostración' },
      ]),
    };

    mockClientRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'client-123', nombre: 'Juan', apellido: 'Pérez', correo: 'juan.perez@example.com' }),
      find: jest.fn().mockResolvedValue([{ id: 'client-123', nombre: 'Juan', apellido: 'Pérez', correo: 'juan.perez@example.com' }]),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    };

    mockCompanyRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'company-123', nombre: 'Grupo Bimbo' }),
      find: jest.fn().mockResolvedValue([{ id: 'company-123', nombre: 'Grupo Bimbo' }]),
    };

    mockOpportunityRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        const qb: any = {
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
          getOne: jest.fn().mockResolvedValue(null),
        };
        return qb;
      }),
    };

    mockActivityRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        const qb: any = {
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
          getOne: jest.fn().mockResolvedValue(null),
        };
        return qb;
      }),
    };

    mockTicketRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    mockProductRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    mockStageRepo = {
      findOne: jest.fn().mockImplementation((args: any) => {
        if (args?.where?.id === 'stage-calificado-uuid') {
          return Promise.resolve({ id: 'stage-calificado-uuid', strname: 'Calificado', pipeline_id: 'pipe-1' });
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockResolvedValue([
        { id: 'stage-prospecto-uuid', strname: 'Prospecto', pipeline_id: 'pipe-1', display_order: 1, blninitial: true, stage_type: 0 },
        { id: 'stage-calificado-uuid', strname: 'Calificado', pipeline_id: 'pipe-1', display_order: 2, blninitial: false, stage_type: 0 },
        { id: 'stage-ganada-uuid', strname: 'Cierre Exitoso', pipeline_id: 'pipe-1', display_order: 3, blninitial: false, stage_type: 1 },
      ]),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        const qb: any = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([
            { id: 'stage-prospecto-uuid', strname: 'Prospecto', pipeline_id: 'pipe-1', display_order: 1, blninitial: true, stage_type: 0 },
            { id: 'stage-calificado-uuid', strname: 'Calificado', pipeline_id: 'pipe-1', display_order: 2, blninitial: false, stage_type: 0 },
            { id: 'stage-ganada-uuid', strname: 'Cierre Exitoso', pipeline_id: 'pipe-1', display_order: 3, blninitial: false, stage_type: 1 },
          ]),
        };
        return qb;
      }),
    };

    service = new WebchatActionExecutorService(
      mockOpportunitiesService,
      mockActivitiesService,
      mockTicketsService,
      mockClientsService,
      mockCompaniesService,
      mockUsersService,
      mockBusinessLineRepo,
      mockDeliveryTypeRepo,
      mockLicensingRepo,
      mockOpportunityLabelRepo,
      mockTypeActivityRepo,
      mockClientRepo,
      mockCompanyRepo,
      mockOpportunityRepo,
      mockActivityRepo,
      mockTicketRepo,
      mockProductRepo,
      mockStageRepo,
    );
  });

  describe('1. Creación de Oportunidades', () => {
    it('Admin puede crear oportunidad cuando proporciona todos los datos requeridos', async () => {
      mockOpportunitiesService.create.mockResolvedValue({
        id: 'opp-created-1',
        nombre_proyecto: 'Proyecto ERP Bimbo',
        monto_total: 50000,
        pipeline_id: 'pipe-1',
        stage: { strname: 'Nueva Oportunidad' },
      });

      const response = await service.handleCreateOpportunity(
        {
          nombreProyecto: 'Proyecto ERP Bimbo',
          empresa: 'Grupo Bimbo',
          monto: 50000,
          lineaNegocio: 'Desarrollo',
          tipoEntrega: 'Proyecto',
          licenciamiento: 'Anual',
          ejecutivo: 'carlos_asesor',
        },
        adminUser,
      );

      expect(mockOpportunitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre_proyecto: 'Proyecto ERP Bimbo',
          monto_total: 50000,
          ejecutivo_id: otherExecutiveUser.id,
          linea_negocio_id: 'bl-default-uuid',
          tipo_entrega_id: 'dt-default-uuid',
          licenciamiento_id: 'lic-default-uuid',
        }),
        expect.any(Object),
      );

      expect(response.answer).toContain('Oportunidad Creada con Éxito');
      expect(response.answer).toContain('Proyecto ERP Bimbo');
      expect(response.dashboardRedirect?.tab).toBe('commercial');
    });

    it('No crea la oportunidad si faltan datos requeridos (línea, entrega, licenciamiento) y solicita la información', async () => {
      mockBusinessLineRepo.find.mockResolvedValue([
        { id: 'bl-1', strname: 'Desarrollo de Software' },
        { id: 'bl-2', strname: 'Infraestructura' },
      ]);
      mockDeliveryTypeRepo.find.mockResolvedValue([
        { id: 'dt-1', strname: 'Proyecto' },
      ]);
      mockLicensingRepo.find.mockResolvedValue([
        { id: 'lic-1', strname: 'Anual' },
        { id: 'lic-2', strname: 'Mensual' },
      ]);

      // Usuario solo dice nombre y empresa, sin catálogos
      const response = await service.handleCreateOpportunity(
        {
          nombreProyecto: 'cotizacion webchat',
          empresa: 'Grupo Bimbo',
        },
        adminUser,
      );

      // No debe llamar a create
      expect(mockOpportunitiesService.create).not.toHaveBeenCalled();
      // Debe solicitar los campos faltantes usando los nombres dinámicos de etiqueta (sin pedir monto ya que es opcional)
      expect(response.answer).toContain('Para poder crear');
      expect(response.answer).not.toContain('Monto / Valor estimado');
      expect(response.answer).toContain('División de Negocio');
      expect(response.answer).toContain('Desarrollo de Software');
      expect(response.answer).toContain('Modalidad de Entrega');
      expect(response.answer).toContain('Tipo de Licenciamiento');
    });

    it('Crea la oportunidad exitosamente aunque no se especifique monto (monto opcional)', async () => {
      mockOpportunitiesService.create.mockResolvedValue({
        id: 'opp-no-monto',
        nombre_proyecto: 'Cotización sin monto',
        monto_total: 0,
        pipeline_id: 'pipe-1',
        stage: { strname: 'Nueva Oportunidad' },
      });

      const response = await service.handleCreateOpportunity(
        {
          nombreProyecto: 'Cotización sin monto',
          empresa: 'Grupo Bimbo',
          lineaNegocio: 'Desarrollo',
          tipoEntrega: 'Proyecto',
          licenciamiento: 'Anual',
        },
        adminUser,
      );

      expect(mockOpportunitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre_proyecto: 'Cotización sin monto',
          monto_total: 0,
        }),
        expect.any(Object),
      );
      expect(response.answer).toContain('Oportunidad Creada con Éxito');
    });

    it('Ejecutivo crea oportunidad forzando estrictamente su propio userId aunque intente pasar otro', async () => {
      mockOpportunitiesService.create.mockResolvedValue({
        id: 'opp-created-2',
        nombre_proyecto: 'Venta Licencias',
        monto_total: 15000,
        pipeline_id: 'pipe-1',
        stage: { strname: 'Nueva Oportunidad' },
      });

      await service.handleCreateOpportunity(
        {
          nombreProyecto: 'Venta Licencias',
          empresa: 'Grupo Bimbo',
          monto: 15000,
          lineaNegocio: 'Desarrollo',
          tipoEntrega: 'Proyecto',
          licenciamiento: 'Anual',
          ejecutivo: 'carlos_asesor', // Intenta asignar a otro
        },
        executiveUser,
      );

      expect(mockOpportunitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ejecutivo_id: executiveUser.id, // Forzado a sí mismo
        }),
        expect.any(Object),
      );
    });
  });

  describe('2. Modificación de Oportunidades', () => {
    const ownOppId = '55555555-5555-5555-5555-555555555555';
    const otherOppId = '44444444-4444-4444-4444-444444444444';

    it('Ejecutivo puede modificar su propia oportunidad', async () => {
      mockOpportunityRepo.findOne.mockResolvedValue({
        id: ownOppId,
        nombre_proyecto: 'Oportunidad de Prueba',
        ejecutivo_id: executiveUser.id,
        moneda: 'MXN',
      });

      mockOpportunitiesService.update.mockResolvedValue({
        id: ownOppId,
        nombre_proyecto: 'Oportunidad Actualizada',
        monto_total: 75000,
        moneda: 'MXN',
        pipeline_id: 'pipe-1',
        stage: { strname: 'En Negociación' },
      });

      const response = await service.handleModifyOpportunity(
        {
          id: ownOppId,
          nombreProyecto: 'Oportunidad Actualizada',
          montoTotal: 75000,
        },
        executiveUser,
      );

      expect(mockOpportunitiesService.update).toHaveBeenCalledWith(ownOppId, expect.objectContaining({
        nombre_proyecto: 'Oportunidad Actualizada',
        monto_total: 75000,
      }), expect.any(Object));
      expect(response.answer).toContain('Oportunidad Modificada Exitosamente');
    });

    it('Ejecutivo tiene acceso denegado al intentar modificar la oportunidad de otro asesor', async () => {
      mockOpportunityRepo.findOne.mockResolvedValue({
        id: otherOppId,
        nombre_proyecto: 'Oportunidad de Carlos',
        ejecutivo_id: otherExecutiveUser.id, // Pertenece a Carlos
        moneda: 'MXN',
      });

      const response = await service.handleModifyOpportunity(
        {
          id: otherOppId,
          montoTotal: 99999,
        },
        executiveUser,
      );

      expect(mockOpportunitiesService.update).not.toHaveBeenCalled();
      expect(response.answer).toContain('Acceso Denegado');
    });

    it('Admin puede modificar la oportunidad de cualquier asesor', async () => {
      mockOpportunityRepo.findOne.mockResolvedValue({
        id: otherOppId,
        nombre_proyecto: 'Oportunidad de Carlos',
        ejecutivo_id: otherExecutiveUser.id,
        moneda: 'MXN',
      });

      mockOpportunitiesService.update.mockResolvedValue({
        id: otherOppId,
        nombre_proyecto: 'Oportunidad de Carlos',
        monto_total: 99999,
        moneda: 'MXN',
        pipeline_id: 'pipe-1',
      });

      const response = await service.handleModifyOpportunity(
        {
          id: otherOppId,
          montoTotal: 99999,
        },
        adminUser,
      );

      expect(mockOpportunitiesService.update).toHaveBeenCalledWith(otherOppId, expect.objectContaining({
        monto_total: 99999,
      }), expect.any(Object));
      expect(response.answer).toContain('Oportunidad Modificada Exitosamente');
    });

    it('Modifica monto de licenciamiento buscando oportunidad por nombre y empresa', async () => {
      const oppPruebaId = '77777777-7777-7777-7777-777777777777';
      const mockOppPrueba = {
        id: oppPruebaId,
        nombre_proyecto: 'prueba',
        monto_licenciamiento: 0,
        monto_servicios: 0,
        monto_total: 0,
        ejecutivo_id: adminUser.id,
        moneda: 'MXN',
      };

      mockOpportunityRepo.createQueryBuilder.mockImplementation(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockOppPrueba),
      }));

      mockOpportunitiesService.update.mockResolvedValue({
        id: oppPruebaId,
        nombre_proyecto: 'prueba',
        monto_licenciamiento: 5000,
        monto_total: 5000,
        moneda: 'MXN',
      });

      const response = await service.handleModifyOpportunity(
        {
          oportunidad: 'prueba',
          empresa: 'Tibs Mx',
          licenciamiento: 5000,
        },
        adminUser,
      );

      expect(mockOpportunitiesService.update).toHaveBeenCalledWith(
        oppPruebaId,
        expect.objectContaining({
          monto_licenciamiento: 5000,
          monto_total: 5000,
        }),
        expect.any(Object),
      );
      expect(response.answer).toContain('Oportunidad Modificada Exitosamente');
      expect(response.answer).toContain('prueba');
    });

    it('Modifica monto de Tipo de Entrega / Servicios dinámicamente', async () => {
      const oppPruebaId = '88888888-8888-8888-8888-888888888888';
      const mockOppPrueba = {
        id: oppPruebaId,
        nombre_proyecto: 'prueba',
        monto_licenciamiento: 5000,
        monto_servicios: 0,
        monto_total: 5000,
        ejecutivo_id: adminUser.id,
        moneda: 'MXN',
      };

      mockOpportunityRepo.createQueryBuilder.mockImplementation(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockOppPrueba),
      }));

      mockOpportunitiesService.update.mockResolvedValue({
        id: oppPruebaId,
        nombre_proyecto: 'prueba',
        monto_licenciamiento: 5000,
        monto_servicios: 8000,
        monto_total: 13000,
        moneda: 'MXN',
      });

      const response = await service.handleModifyOpportunity(
        {
          oportunidad: 'prueba',
          empresa: 'Tibs Mx',
          montoServicios: 8000,
        },
        adminUser,
      );

      expect(mockOpportunitiesService.update).toHaveBeenCalledWith(
        oppPruebaId,
        expect.objectContaining({
          monto_servicios: 8000,
          monto_total: 13000,
        }),
        expect.any(Object),
      );
      expect(response.answer).toContain('Oportunidad Modificada Exitosamente');
    });

    it('Permite mover una oportunidad de etapa exitosamente (ej. a Calificado)', async () => {
      const oppPruebaId = '55555555-5555-5555-5555-555555555555';
      const mockOpp = {
        id: oppPruebaId,
        nombre_proyecto: 'Cotización Red Magic',
        pipeline_id: 'pipe-1',
        stage_id: 'stage-prospecto-uuid',
        stage: { id: 'stage-prospecto-uuid', strname: 'Prospecto' },
        monto_total: 300,
        monto_licenciamiento: 0,
        monto_servicios: 0,
        moneda: 'MXN',
        ejecutivo_id: adminUser.id,
      };

      mockOpportunityRepo.createQueryBuilder.mockImplementation(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockOpp),
      }));

      mockOpportunitiesService.update.mockResolvedValue({
        ...mockOpp,
        stage_id: 'stage-calificado-uuid',
        stage: { id: 'stage-calificado-uuid', strname: 'Calificado' },
      });

      const response = await service.handleModifyOpportunity(
        {
          nombreProyecto: 'Cotización Red Magic',
          etapa: 'Calificado',
        },
        adminUser,
      );

      expect(mockOpportunitiesService.update).toHaveBeenCalledWith(
        oppPruebaId,
        expect.objectContaining({
          stage_id: 'stage-calificado-uuid',
        }),
        expect.any(Object),
      );
      expect(response.answer).toContain('Oportunidad Modificada Exitosamente');
      expect(response.answer).toContain('Prospecto ➔ Calificado');
    });

    it('Fusiona contexto en conversación multi-turno para mover etapa (ej. "muevela a calificado")', async () => {
      const oppPruebaId = '55555555-5555-5555-5555-555555555555';
      const mockOpp = {
        id: oppPruebaId,
        nombre_proyecto: 'Cotización Red Magic',
        pipeline_id: 'pipe-1',
        stage_id: 'stage-prospecto-uuid',
        stage: { id: 'stage-prospecto-uuid', strname: 'Prospecto' },
        monto_total: 300,
        ejecutivo_id: adminUser.id,
      };

      mockOpportunityRepo.createQueryBuilder.mockImplementation(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockOpp),
      }));

      mockOpportunitiesService.update.mockResolvedValue({
        ...mockOpp,
        stage_id: 'stage-calificado-uuid',
        stage: { id: 'stage-calificado-uuid', strname: 'Calificado' },
      });

      const history: any[] = [
        { role: 'user', content: 'Cotización Red Magic' },
        { role: 'assistant', content: '1. Cotización Red Magic (Pedro Pérez) - $300.00 MXN [Prospecto]' },
        { role: 'user', content: 'muevela a calificado' },
      ];

      const response = await service.executeAction(
        {
          action: 'modifyOpportunity',
          parameters: {},
        },
        adminUser,
        'muevela a calificado',
        history,
      );

      expect(mockOpportunitiesService.update).toHaveBeenCalledWith(
        oppPruebaId,
        expect.objectContaining({
          stage_id: 'stage-calificado-uuid',
        }),
        expect.any(Object),
      );
      expect(response.answer).toContain('Prospecto ➔ Calificado');
    });
  });

  describe('3. Creación de Actividades y checkAvailability', () => {
    it('Crea actividad exitosamente cuando el horario está libre', async () => {
      mockActivitiesService.findByUserAndDate.mockResolvedValue([]); // Sin colisiones

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(15, 0, 0, 0);

      mockActivitiesService.create.mockResolvedValue({
        id: 'act-1',
        activity: 'Reunión de seguimiento con Juan',
        date: futureDate.toISOString(),
        typeActivity: { strname: 'Reunión' },
      });

      const response = await service.handleCreateActivity(
        {
          activity: 'Reunión de seguimiento con Juan',
          date: futureDate.toISOString(),
        },
        executiveUser,
      );

      expect(mockActivitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'Reunión de seguimiento con Juan',
          typeActivityId: 1, // Resuelto automáticamente
        }),
        expect.objectContaining({ id: executiveUser.id }),
      );
      expect(response.answer).toContain('Actividad Programada Exitosamente');
    });

    it('Relaciona opcionalmente cliente y empresa al crear actividad si el usuario los proporciona', async () => {
      mockActivitiesService.findByUserAndDate.mockResolvedValue([]);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(11, 0, 0, 0);

      mockActivitiesService.create.mockResolvedValue({
        id: 'act-with-client',
        activity: 'Visita presencial a Grupo Bimbo con Juan',
        date: futureDate.toISOString(),
        typeActivity: { strname: 'Visita' },
      });

      const response = await service.handleCreateActivity(
        {
          activity: 'Visita presencial a Grupo Bimbo con Juan',
          date: futureDate.toISOString(),
          cliente: 'Juan Pérez',
          empresa: 'Grupo Bimbo',
        },
        executiveUser,
      );

      expect(mockActivitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'Visita presencial a Grupo Bimbo con Juan',
          clientId: 'client-123',
          companyId: 'company-123',
        }),
        expect.objectContaining({ id: executiveUser.id }),
      );
      expect(response.answer).toContain('Actividad Programada Exitosamente');
      expect(response.answer).toContain('Juan Pérez');
    });

    it('Detecta conflicto en checkAvailability y sugiere horarios alternativos', async () => {
      const conflictDate = new Date();
      conflictDate.setDate(conflictDate.getDate() + 1);
      conflictDate.setHours(16, 0, 0, 0);

      // Actividad ya existente a las 16:15
      const existingActDate = new Date(conflictDate);
      existingActDate.setMinutes(15);

      mockActivitiesService.findByUserAndDate.mockResolvedValue([
        { id: 'existing-act', date: existingActDate.toISOString() },
      ]);

      const response = await service.handleCreateActivity(
        {
          activity: 'Llamada urgente',
          date: conflictDate.toISOString(),
        },
        executiveUser,
      );

      expect(mockActivitiesService.create).not.toHaveBeenCalled();
      expect(response.answer).toContain('Conflicto de Horario');
      expect(response.answer).toContain('Horarios libres sugeridos');
    });

    it('Completa y crea la actividad fusionando parámetros del historial en flujos multi-turno', async () => {
      mockActivitiesService.findByUserAndDate.mockResolvedValue([]);
      mockActivitiesService.create.mockResolvedValue({
        id: 'act-multiturn',
        activity: 'seguimiento de historicos',
        date: '2026-09-03T18:00:00.000Z',
        typeActivity: { strname: 'Reunión' },
      });

      const conversationHistory = [
        {
          role: 'user' as const,
          content: 'crea una actividad para el jueves a las 12 pm con el cliente tibs mx llamada "seguimiento de historicos"',
        },
        {
          role: 'assistant' as const,
          content: 'Para agendar la actividad, por favor proporciona el tipo de actividad.',
        },
      ];

      const response = await service.executeAction(
        {
          action: 'createActivity',
          parameters: {
            tipoActividad: 'reunion',
          },
        },
        adminUser,
        'tipo : reunion',
        conversationHistory,
      );

      expect(mockActivitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'seguimiento de historicos',
          typeActivityId: 1, // Reunión
        }),
        expect.any(Object),
      );
      expect(response.answer).toContain('Actividad Programada Exitosamente');
    });

    it('No crea la actividad y solicita el correo si el contacto relacionado no tiene correo asignado', async () => {
      mockActivitiesService.findByUserAndDate.mockResolvedValue([]);
      mockClientRepo.findOne.mockResolvedValue({
        id: 'client-no-email',
        nombre: 'Carlos',
        apellido: 'Santana',
        correo: null,
      });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(10, 0, 0, 0);

      const response = await service.handleCreateActivity(
        {
          activity: 'Reunión de demostración',
          date: futureDate.toISOString(),
          cliente: 'Carlos Santana',
        },
        executiveUser,
      );

      expect(mockActivitiesService.create).not.toHaveBeenCalled();
      expect(response.answer).toContain('es obligatorio que tenga un correo electrónico asignado');
      expect(response.answer).toContain('Carlos Santana');
    });

    it('Asigna y guarda el correo en el contacto si se proporciona en la consulta y crea la actividad', async () => {
      mockActivitiesService.findByUserAndDate.mockResolvedValue([]);
      const clientWithoutEmail = {
        id: 'client-to-update',
        nombre: 'Carlos',
        apellido: 'Santana',
        correo: null,
      };
      mockClientRepo.findOne.mockResolvedValue(clientWithoutEmail);
      mockActivitiesService.create.mockResolvedValue({
        id: 'act-with-new-email',
        activity: 'Reunión comercial',
        date: '2026-09-09T16:00:00.000Z',
        typeActivity: { strname: 'Reunión' },
      });

      const response = await service.handleCreateActivity(
        {
          activity: 'Reunión comercial',
          date: '2026-09-09T16:00:00.000Z',
          cliente: 'Carlos Santana',
          correo: 'carlos.santana@empresa.com',
        },
        executiveUser,
      );

      expect(mockClientRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'client-to-update',
          correo: 'carlos.santana@empresa.com',
        }),
      );
      expect(mockActivitiesService.create).toHaveBeenCalled();
      expect(response.answer).toContain('Actividad Programada Exitosamente');
    });

    it('Completa y crea la actividad cuando el usuario proporciona el correo en el siguiente turno (multi-turno)', async () => {
      mockActivitiesService.findByUserAndDate.mockResolvedValue([]);
      const clientWithoutEmail = {
        id: 'client-multiturn',
        nombre: 'Carlos',
        apellido: 'Santana',
        correo: null,
      };
      mockClientRepo.findOne.mockResolvedValue(clientWithoutEmail);
      mockActivitiesService.create.mockResolvedValue({
        id: 'act-multiturn-email',
        activity: 'Demo con Carlos',
        date: '2026-09-10T17:00:00.000Z',
        typeActivity: { strname: 'Reunión' },
      });

      const conversationHistory = [
        {
          role: 'user' as const,
          content: 'agenda reunión para mañana 11am con el cliente Carlos llamada "Demo con Carlos"',
        },
        {
          role: 'assistant' as const,
          content: 'Para agendar la actividad con el contacto "Carlos Santana", es obligatorio que tenga un correo electrónico asignado en el CRM. Por favor proporciona el correo del contacto.',
        },
      ];

      const response = await service.executeAction(
        {
          action: 'createActivity',
          parameters: {
            correo: 'carlos@santana.com',
          },
        },
        adminUser,
        'carlos@santana.com',
        conversationHistory,
      );

      expect(mockClientRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'client-multiturn',
          correo: 'carlos@santana.com',
        }),
      );
      expect(mockActivitiesService.create).toHaveBeenCalled();
      expect(response.answer).toContain('Actividad Programada Exitosamente');
    });

    it('Programa actividad para "pasado mañana a las 3 pm" con recordatorio a la 1 pm y soporta typo "reordatorio"', async () => {
      mockActivitiesService.findByUserAndDate.mockResolvedValue([]);
      mockActivitiesService.create.mockImplementation((dto: any, user: any) => {
        return Promise.resolve({
          id: 'act-pasado-manana',
          activity: dto.activity,
          date: dto.date,
          typeActivityId: dto.typeActivityId,
          typeActivity: { strname: 'Demostración' },
          client: { id: 'client-123', nombre: 'Andrea', apellido: 'Ramírez', correo: 'andrea@pacific.com' },
          company: { id: 'comp-123', nombre: 'Constructora Pacífico' },
        });
      });

      const response = await service.executeAction(
        {
          action: 'createActivity',
          parameters: {
            activity: 'Demostración con Andrea Ramírez',
            date: 'pasado mañana a las 3 pm',
            recordatorio: '1 pm',
            cliente: 'Andrea Ramírez',
            empresa: 'Constructora Pacífico',
          },
        },
        adminUser,
        'crea una demostracion con andrea ramirez de constructora pacifico para pasado mañana a las 3 pm con reordatorio a la 1 pm',
      );

      expect(mockActivitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'Demostración con Andrea Ramírez',
          typeActivityId: 4, // Demostración
          reminder: expect.objectContaining({
            date: expect.any(String),
          }),
        }),
        expect.any(Object),
      );

      const createdDto = mockActivitiesService.create.mock.calls[0][0];
      const activityDate = new Date(createdDto.date);
      const reminderDate = new Date(createdDto.reminder.date);

      const tz = service.getTimezone();
      const actTimeStr = activityDate.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      expect(actTimeStr).toBe('15:00');

      const remTimeStr = reminderDate.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      expect(remTimeStr).toBe('13:00');

      const nowParts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
      const nowMap: any = {};
      for (const p of nowParts) nowMap[p.type] = parseInt(p.value, 10);
      const expectedDay = new Date(Date.UTC(nowMap.year, nowMap.month - 1, nowMap.day + 2)).getUTCDate();

      const actDay = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(activityDate), 10);
      expect(actDay).toBe(expectedDay);

      expect(response.answer).toContain('Actividad Programada Exitosamente');
      expect(response.answer).toContain('Demostración');
    });

    it('parseNaturalDate aísla correctamente la hora sin confundirse con el día del mes o textos de recordatorio', () => {
      const d1 = service.parseNaturalDate('pasado mañana a las 3 pm');
      const tz = service.getTimezone();
      const time1 = d1.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      expect(time1).toBe('15:00');

      const d2 = service.parseNaturalDate('4 de octubre a las 3 pm');
      const time2 = d2.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      expect(time2).toBe('15:00');
      const day2 = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(d2), 10);
      expect(day2).toBe(4);

      const d3 = service.parseNaturalDate('pasado mañana a las 3 pm con reordatorio a la 1 pm');
      const time3 = d3.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      expect(time3).toBe('15:00');
    });
  });

  describe('4. Modificación de Actividades', () => {
    it('Ejecutivo no puede modificar actividades de otros usuarios', async () => {
      mockActivityRepo.findOne.mockResolvedValue({
        id: 'act-carlos',
        userId: otherExecutiveUser.id,
        activity: 'Llamada de Carlos',
      });

      const response = await service.handleModifyActivity(
        {
          id: 'act-carlos',
          activity: 'Cambio de título',
        },
        executiveUser,
      );

      expect(mockActivitiesService.update).not.toHaveBeenCalled();
      expect(response.answer).toContain('Acceso Denegado');
    });

    it('Modifica el nombre de una actividad encontrada por hora (ej. "las 3")', async () => {
      const today3pm = new Date();
      today3pm.setHours(15, 0, 0, 0);

      const existingAct = {
        id: 'act-3pm-id',
        userId: adminUser.id,
        activity: 'Actividad antigua',
        date: today3pm.toISOString(),
        typeActivity: { strname: 'Reunión' },
      };

      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([existingAct]),
        getOne: jest.fn().mockResolvedValue(existingAct),
      };
      mockActivityRepo.createQueryBuilder.mockReturnValue(qbMock);

      mockActivitiesService.update.mockResolvedValue({
        ...existingAct,
        activity: 'consulta',
      });

      const response = await service.handleModifyActivity(
        {
          targetDate: 'las 3',
          newActivity: 'consulta',
        },
        adminUser,
      );

      expect(mockActivitiesService.update).toHaveBeenCalledWith('act-3pm-id', expect.objectContaining({
        activity: 'consulta',
      }), expect.any(Object));
      expect(response.answer).toContain('Actividad Modificada con Éxito');
      expect(response.answer).toContain('consulta');
    });
  });

  describe('5. Creación de Tickets', () => {
    it('Crea ticket completando campos requeridos y asignando responsable por rol', async () => {
      mockTicketsService.create.mockResolvedValue({
        id: 'ticket-uuid-1',
        ticket_number: 1045,
        strtitle: 'Error en exportación de facturas',
        tipo_incidencia: 'Soporte Técnico',
        priority: 3,
        helpdesk_id: 'hd-1',
      });

      const response = await service.handleCreateTicket(
        {
          title: 'Error en exportación de facturas',
          urgente: true,
        },
        executiveUser,
      );

      expect(mockTicketsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          strtitle: 'Error en exportación de facturas',
          priority: 3,
          responsable_id: executiveUser.id,
          tipo_incidencia: 'Soporte Técnico',
        }),
        expect.any(Object),
      );

      expect(response.answer).toContain('Ticket de Soporte Creado');
      expect(response.answer).toContain('#1045');
      expect(response.dashboardRedirect?.tab).toBe('support');
    });
  });
});
