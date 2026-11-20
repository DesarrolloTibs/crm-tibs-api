import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { UpdateMainPipelineDto } from '../pipelines/dto/update-main-pipeline.dto';
import { UpdateMainHelpdeskDto } from '../tickets/dto/update-main-helpdesk.dto';
import { CreateOpportunityDto } from '../opportunities/dto/create-opportunity.dto';
import { UpdateOpportunityDto } from '../opportunities/dto/update-opportunity.dto';
import { GetOpportunitiesFilterDto } from '../opportunities/dto/get-opportunities-filter.dto';
import { CreateClientDto } from '../clients/dto/create-client.dto';
import { CreateCompanyDto } from '../companies/dto/create-company.dto';
import { CreateTicketDto } from '../tickets/dto/create-ticket.dto';
import { PublicTicketQueryDto } from '../tickets/dto/tickets-query.dto';
import { CreateExpenseDto } from '../expenses/dto/create-expense.dto';
import { CreateActivityDto } from '../activities/dto/create-activity.dto';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { CreateIndicatorDto } from '../reports/dto/indicator.dto';
import { Currency } from '../opportunities/entities/opportunity.entity';
import { PipelinesController } from '../pipelines/pipelines.controller';
import { HelpdesksController } from '../tickets/helpdesks.controller';
import { OpportunityCatalogsController } from '../opportunities/opportunity-catalogs.controller';
import { OpportunityLabelsController } from '../opportunities/opportunity-labels.controller';
import { ReportsController } from '../reports/reports.controller';
import { ActivitiesService } from '../activities/activities.service';
import { ExpensesService } from '../expenses/expenses.service';
import { TicketsService } from '../tickets/tickets.service';
import { PipelinesService } from '../pipelines/pipelines.service';
import { AiAgentToolsHandlerService } from '../conversations/ai-agent-tools-handler.service';
import { Role } from '../role.enum';

describe('Bloque 2 - Core CRM DTOs, RBAC, Services & AI Tool Compatibility', () => {
  const globalPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: false,
    transformOptions: { enableImplicitConversion: false },
  });

  const validateBody = <T>(dtoClass: new () => T, payload: Record<string, any>) =>
    globalPipe.transform(payload, { type: 'body', metatype: dtoClass });

  const validateQuery = <T>(dtoClass: new () => T, payload: Record<string, any>) =>
    globalPipe.transform(payload, { type: 'query', metatype: dtoClass });

  const validUuid1 = '11111111-1111-4111-8111-111111111111';
  const validUuid2 = '22222222-2222-4222-8222-222222222222';
  const execUser = { id: validUuid1, username: 'exec', role: Role.Executive } as any;
  const adminUser = { id: validUuid2, username: 'admin', role: Role.Admin } as any;
  const superAdminUser = { id: validUuid2, username: 'root', role: Role.SuperAdmin } as any;

  describe('DTOs & Global ValidationPipe', () => {
    it('UpdateMainPipelineDto validates nested stages, intmaxdays (0..365) and stage_type (0..2)', async () => {
      await expect(
        validateBody(UpdateMainPipelineDto, {
          strname: 'Pipeline Ventas',
          stages: [
            {
              strname: 'Cierre',
              blnstatus: true,
              display_order: 1,
              blninitial: true,
              intmaxdays: 400,
              stage_type: 1,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateBody(UpdateMainPipelineDto, {
          stages: [
            {
              strname: 'Invalida',
              blnstatus: true,
              display_order: 0,
              blninitial: true,
              stage_type: 3,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);

      const parsed = await validateBody(UpdateMainPipelineDto, {
        strname: '  Pipeline Principal  ',
        stages: [
          {
            id: validUuid1,
            strname: '  Ganada  ',
            blnstatus: true,
            display_order: 0,
            strcolor: '',
            blninitial: true,
            intmaxdays: 30,
            stage_type: 1,
          },
        ],
      });
      expect(parsed.strname).toBe('Pipeline Principal');
      expect(parsed.stages?.[0].strname).toBe('Ganada');
      expect(parsed.stages?.[0].strcolor).toBeNull();
    });

    it('UpdateMainHelpdeskDto enforces stage_type in 0..1 and intmaxdays in 0..365', async () => {
      await expect(
        validateBody(UpdateMainHelpdeskDto, {
          stages: [
            {
              strname: 'Cerrada',
              blnstatus: true,
              display_order: 1,
              blninitial: false,
              stage_type: 2,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);

      const ok = await validateBody(UpdateMainHelpdeskDto, {
        stages: [
          {
            strname: 'Resuelto',
            blnstatus: true,
            display_order: 1,
            blninitial: true,
            intmaxdays: 15,
            stage_type: 1,
          },
        ],
      });
      expect(ok.stages?.[0].stage_type).toBe(1);
    });

    it('CreateOpportunityDto validates positive tipoCambio for USD, decimal(10,2) upper bound & allowed canal_origen', async () => {
      const mxnDto = await validateBody(CreateOpportunityDto, {
        nombre_proyecto: '  Proyecto MXN  ',
        description: 'Desc',
        moneda: Currency.MXN,
        tipoCambio: 0,
        linea_negocio_id: validUuid1,
        tipo_entrega_id: validUuid2,
        canal_origen: 'manual',
      });
      expect(mxnDto.nombre_proyecto).toBe('Proyecto MXN');

      await expect(
        validateBody(CreateOpportunityDto, {
          nombre_proyecto: 'Proyecto USD inválido',
          description: 'Desc',
          moneda: Currency.USD,
          tipoCambio: 0,
          linea_negocio_id: validUuid1,
          tipo_entrega_id: validUuid2,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateBody(CreateOpportunityDto, {
          nombre_proyecto: 'Overflow',
          description: 'Desc',
          moneda: Currency.USD,
          tipoCambio: 20,
          monto_total: 100000000,
          linea_negocio_id: validUuid1,
          tipo_entrega_id: validUuid2,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateBody(CreateOpportunityDto, {
          nombre_proyecto: 'Bad Channel',
          description: 'Desc',
          moneda: Currency.USD,
          tipoCambio: 20,
          linea_negocio_id: validUuid1,
          tipo_entrega_id: validUuid2,
          canal_origen: 'telegram',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('GetOpportunitiesFilterDto validates dates and boolean query parsing', async () => {
      await expect(
        validateQuery(GetOpportunitiesFilterDto, { startDate: 'ayer' }),
      ).rejects.toThrow(BadRequestException);

      const q = await validateQuery(GetOpportunitiesFilterDto, {
        showArchived: 'true',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
      expect(q.showArchived).toBe(true);
    });

    it('CreateCompanyDto enforces http/https URL on REST while CreateClientDto normalizes empty optional strings to null', async () => {
      await expect(
        validateBody(CreateCompanyDto, {
          nombre: 'Empresa Web',
          website: 'www.grupoalfa.com',
        }),
      ).rejects.toThrow(BadRequestException);

      const validCompany = await validateBody(CreateCompanyDto, {
        nombre: '  Empresa Web  ',
        website: 'https://www.grupoalfa.com',
        correo: '',
        telefono: '',
      });
      expect(validCompany.nombre).toBe('Empresa Web');
      expect(validCompany.correo).toBeNull();
      expect(validCompany.telefono).toBeNull();

      const validClient = await validateBody(CreateClientDto, {
        nombre: 'Ana',
        correo: '',
        telefono: '+52 (55) 1234-5678',
      });
      expect(validClient.correo).toBeNull();
      await expect(
        validateBody(CreateClientDto, {
          nombre: 'Ana',
          telefono: 'x'.repeat(55),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('CreateTicketDto & PublicTicketQueryDto validate lengths and strict numeric ticket numbers', async () => {
      await expect(
        validateBody(CreateTicketDto, {
          strtitle: 'Soporte',
          tipo_incidencia: 'General',
          description: 'No carga',
          contactPhone: '9'.repeat(51),
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateQuery(PublicTicketQueryDto, { ticketNumber: '12abc' }),
      ).rejects.toThrow(BadRequestException);

      const validQuery = await validateQuery(PublicTicketQueryDto, { ticketNumber: '#0042' });
      expect(validQuery.ticketNumber).toBe('#0042');
    });

    it('CreateExpenseDto requires positive monto and caps concepto at 255', async () => {
      await expect(
        validateBody(CreateExpenseDto, {
          fecha: '2026-11-05',
          concepto: 'Comida',
          monto: 0,
          client_id: validUuid1,
        }),
      ).rejects.toThrow(BadRequestException);

      const ok = await validateBody(CreateExpenseDto, {
        fecha: '2026-11-05',
        concepto: '  Taxi aeropuerto  ',
        monto: 350.5,
        client_id: validUuid1,
        opportunity_id: '',
      });
      expect(ok.concepto).toBe('Taxi aeropuerto');
      expect(ok.opportunity_id).toBeNull();
    });

    it('CreateActivityDto, CreateProductDto and CreateIndicatorDto enforce bounds & enums', async () => {
      await expect(
        validateBody(CreateActivityDto, {
          date: '2026-11-20T10:00:00Z',
          activity: 'Llamada',
          typeActivityId: 0,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateBody(CreateProductDto, { nombre: 'Licencia', precioBase: -1 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateBody(CreateIndicatorDto, { title: 'KPI', type: 'avg' }),
      ).rejects.toThrow(BadRequestException);

      const okAct = await validateBody(CreateActivityDto, {
        date: '2026-11-20T10:00:00Z',
        activity: 'Seguimiento',
        typeActivityId: 1,
        opportunityId: '',
        externalProvider: 'GOOGLE',
      });
      expect(okAct.opportunityId).toBeNull();
      expect(okAct.externalProvider).toBe('google');
    });
  });

  describe('Controller RBAC Checks', () => {
    it('Blocks Executive on admin-only pipeline, helpdesk, catalog, label & indicator mutations', async () => {
      const pipelinesCtrl = new PipelinesController({ updateMainPipeline: jest.fn() } as any);
      expect(() => pipelinesCtrl.updateMainPipeline({} as any, execUser)).toThrow(ForbiddenException);

      const helpdesksCtrl = new HelpdesksController({
        updateMainHelpdesk: jest.fn(),
        saveCronConfig: jest.fn(),
      } as any);
      expect(() => helpdesksCtrl.updateMainHelpdesk({} as any, execUser)).toThrow(ForbiddenException);
      expect(() => helpdesksCtrl.saveCronConfig({} as any, execUser)).toThrow(ForbiddenException);

      const catalogsCtrl = new OpportunityCatalogsController({ create: jest.fn() } as any);
      await expect(
        catalogsCtrl.createBusinessLine({ strname: 'Test' }, execUser),
      ).rejects.toThrow(ForbiddenException);

      const labelsCtrl = new OpportunityLabelsController({ update: jest.fn() } as any);
      await expect(
        labelsCtrl.update(validUuid1, { strname: 'Label' }, execUser),
      ).rejects.toThrow(ForbiddenException);

      const reportsCtrl = new ReportsController({ createIndicator: jest.fn() } as any);
      expect(() => reportsCtrl.createIndicator({ title: 'KPI' }, execUser)).toThrow(ForbiddenException);
    });
  });

  describe('Service Ownership, FKs, stage_type & AI Tool Compatibility', () => {
    it('ActivitiesService.remove enforces ownership for Executive while allowing SuperAdmin', async () => {
      const mockActivityRepo: any = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({
          id: validUuid2,
          userId: validUuid2,
          opportunity: null,
          typeActivity: { id: 1, strname: 'Llamada' },
        }),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mockUsersService: any = {
        findOneById: jest.fn().mockImplementation((id: string) =>
          Promise.resolve(id === validUuid1 ? execUser : superAdminUser),
        ),
      };
      const svc = new ActivitiesService(
        mockActivityRepo,
        { findOne: jest.fn().mockResolvedValue({ id: 1 }) } as any,
        { find: jest.fn().mockResolvedValue([]) } as any,
        mockUsersService,
        { create: jest.fn() } as any,
        { upsertForActivity: jest.fn(), findByActivity: jest.fn() } as any,
        { createAndSendNotification: jest.fn() } as any,
        { emit: jest.fn() } as any,
        { emitActivityDeleted: jest.fn(), emitActivityUpdated: jest.fn() } as any,
        { sendActivityNoticeToClient: jest.fn() } as any,
      );

      await expect(svc.remove(validUuid2, execUser)).rejects.toThrow(ForbiddenException);
      await expect(svc.remove(validUuid2, superAdminUser)).resolves.toBeUndefined();
      expect(mockActivityRepo.delete).toHaveBeenCalledWith(validUuid2);
    });

    it('ExpensesService validates non-positive amounts, FK existence and non-owner access', async () => {
      const mockManager: any = {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue(null),
        }),
      };
      const mockExpenseRepo: any = {
        manager: mockManager,
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({
          id: validUuid2,
          usuario_id: validUuid2,
          client_id: validUuid1,
          opportunity_id: null,
          monto: 100,
        }),
      };
      const svc = new ExpensesService(
        mockExpenseRepo,
        { findOneById: jest.fn().mockResolvedValue(execUser) } as any,
      );

      await expect(
        svc.create({ fecha: '2026-11-20', concepto: 'Comida', monto: -10, client_id: validUuid1 }, execUser),
      ).rejects.toThrow(BadRequestException);

      await expect(
        svc.create({ fecha: '2026-11-20', concepto: 'Comida', monto: 50, client_id: validUuid1 }, execUser),
      ).rejects.toThrow(NotFoundException);

      await expect(svc.findOne(validUuid2, execUser)).rejects.toThrow(ForbiddenException);
      await expect(svc.findOne(validUuid2, adminUser)).resolves.toBeDefined();
    });

    it('TicketsService requires notas_resolucion for stage_type === 1 even if renamed and truncates external phone', async () => {
      const helpdeskRepo: any = {
        findOne: jest.fn().mockResolvedValue({ id: 'hd-1' }),
      };
      const stageRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          id: validUuid2,
          helpdesk_id: 'hd-1',
          strname: 'Finalizado',
          stage_type: 1,
        }),
      };
      const clientRepo: any = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((d) => d),
        save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'c-1', ...d })),
      };
      const ticketRepo: any = {
        manager: { getRepository: jest.fn().mockReturnValue({ findOne: jest.fn() }) },
        create: jest.fn(),
        save: jest.fn().mockImplementation((t) => Promise.resolve({ id: 't-1', ...t })),
        findOne: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({ id: where.id, ticket_number: 1, stage: { stage_type: 1, strname: 'Finalizado' } }),
        ),
      };

      const svc = new TicketsService(
        ticketRepo,
        helpdeskRepo,
        stageRepo,
        clientRepo,
        { emitTicketCreated: jest.fn(), emitTicketUpdated: jest.fn() } as any,
        { create: jest.fn() } as any,
        { createAndSendNotification: jest.fn() } as any,
      );

      await expect(
        svc.create({
          strtitle: 'Bug',
          tipo_incidencia: 'Soporte',
          description: 'Detalle',
          stage_id: validUuid2,
        }),
      ).rejects.toThrow(BadRequestException);

      await svc.create({
        strtitle: 'Bug',
        tipo_incidencia: 'Soporte',
        description: 'Detalle',
        stage_id: validUuid2,
        notas_resolucion: 'Solucionado correctamente',
        contactName: 'Pedro',
        contactEmail: 'pedro@test.com',
        contactPhone: '1234567890'.repeat(6),
      });

      expect(clientRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          telefono: '1234567890'.repeat(5),
        }),
      );
    });

    it('PipelinesService rejects updating a stage that belongs to another pipeline', async () => {
      const stage = { id: validUuid2, pipeline_id: 'other-pipeline-id', strname: 'Otro' };
      const manager: any = {
        save: jest.fn().mockResolvedValue({}),
        findOne: jest.fn().mockResolvedValue(stage),
      };
      const svc = new PipelinesService(
        { findOne: jest.fn().mockResolvedValue({ id: validUuid1, stages: [] }), save: jest.fn() } as any,
        {} as any,
        { transaction: jest.fn().mockImplementation((cb) => cb(manager)) } as any,
        { emitPipelineUpdated: jest.fn() } as any,
      );

      await expect(
        svc.updateMainPipeline({
          stages: [
            {
              id: validUuid2,
              strname: 'Etapa ajena',
              blnstatus: true,
              display_order: 0,
              blninitial: true,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('AiAgentToolsHandlerService returns structured ERROR when createActivity receives invalid typeActivityId', async () => {
      const mockTypeRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([{ id: 1, strname: 'Llamada' }]),
      };
      const toolsHandler = new AiAgentToolsHandlerService(
        { manager: { getRepository: jest.fn().mockReturnValue(mockTypeRepo) } } as any,
        {
          findOne: jest.fn().mockResolvedValue({ id: validUuid1, correo: 'ana@test.com' }),
        } as any,
        {} as any,
        { findByClientId: jest.fn().mockResolvedValue([]) } as any,
        { create: jest.fn() } as any,
        {} as any,
        {} as any,
        { findOneById: jest.fn().mockResolvedValue(adminUser) } as any,
        {} as any,
        { emit: jest.fn() } as any,
      );

      const res = await toolsHandler.executeTool(
        'createActivity',
        { activityText: 'Demo', date: '2026-11-25T10:00:00Z', typeActivityId: 999 },
        { id: 'conv-1', clientId: validUuid1, assignedUserId: validUuid2 } as any,
        {} as any,
      );

      expect(res.status).toBe('ERROR');
      expect(res.message).toContain('999');
      expect(res.message).toContain('Llamada');
    });
  });
});
