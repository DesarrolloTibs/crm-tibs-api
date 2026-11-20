import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import {
  AI_AGENT_TOOL_SCHEMAS,
  CheckAvailabilitySchema,
  ConsultProductCatalogSchema,
  CreateActivitySchema,
  CreateOpportunitySchema,
  CreateTicketSchema,
  ModifyOpportunitySchema,
  RegisterContactSchema,
} from '../conversations/dto/ai-agent-tools.schema';
import { SaveSubAgentDto } from '../conversations/dto/ai-config.dto';
import {
  AssignUserDto,
  SaveChannelConfigDto,
  TestReceiveMessageDto,
  UpsertBaseTemplateDto,
} from '../conversations/dto/conversations.dto';
import { WebchatQueryDto } from '../webchat/dto/webchat-query.dto';
import {
  GetPublicWebchatQueryDto,
  SendPublicWebchatMessageDto,
} from '../webchat/dto/public-webchat.dto';
import { GetCalendarAuthUrlQueryDto } from '../calendar-integrations/dto/calendar-integrations.dto';
import { ConversationsController } from '../conversations/conversations.controller';
import { WebchatController } from '../webchat/webchat.controller';
import { CalendarWebhooksController } from '../calendar-integrations/calendar-webhooks.controller';
import { AiAgentToolsHandlerService } from '../conversations/ai-agent-tools-handler.service';
import { AiAgentOrchestratorService } from '../conversations/ai-agent-orchestrator.service';
import { MetaOauthService } from '../conversations/meta-oauth.service';
import { Role } from '../role.enum';

describe('Bloque 3 - AI Tools Zod, Sub-Agents, Channels, WebChat, RAG & Calendar Validation', () => {
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

  describe('Zod Tool Schemas & Direct Tool Execution Guardrails', () => {
    it('CreateOpportunitySchema enforces numeric bounds while preserving non-UUID product name/calibre fallback', () => {
      const ok = CreateOpportunitySchema.safeParse({
        nombreProyecto: '  Cotización Nylon  ',
        montoTotal: '1500.50',
        moneda: 'MXN',
        items: [{ nombre: 'Nylon 6-0', cantidad: '3', productId: 'Nylon 6-0' }],
        correo: '',
      });
      expect(ok.success).toBe(true);
      if (ok.success) {
        expect(ok.data.montoTotal).toBe(1500.5);
        expect(ok.data.items?.[0].cantidad).toBe(3);
        expect(ok.data.correo).toBeUndefined();
      }

      expect(
        CreateOpportunitySchema.safeParse({
          nombreProyecto: 'Negativa',
          montoTotal: -100,
        }).success,
      ).toBe(false);

      expect(
        CreateOpportunitySchema.safeParse({
          nombreProyecto: 'Overflow',
          montoTotal: 100000000,
        }).success,
      ).toBe(false);

      expect(
        CreateOpportunitySchema.safeParse({
          nombreProyecto: 'Cantidad Mala',
          items: [{ nombre: 'Producto', cantidad: -2 }],
        }).success,
      ).toBe(false);
    });

    it('ModifyOpportunitySchema, RegisterContactSchema & ConsultProductCatalogSchema validate strict bounds', () => {
      expect(
        ModifyOpportunitySchema.safeParse({
          id: 'not-a-uuid',
          montoTotal: 100,
        }).success,
      ).toBe(false);

      const contactOk = RegisterContactSchema.safeParse({
        nombre: '  Laura Gómez ',
        correo: '',
        telefono: '',
      });
      expect(contactOk.success).toBe(true);
      if (contactOk.success) {
        expect(contactOk.data.correo).toBeNull();
        expect(contactOk.data.telefono).toBeNull();
      }

      const catalogOk = ConsultProductCatalogSchema.safeParse({
        query: 'Billy IDP',
        products: ['Billy IDP', 'CRM Tibs'],
        search: 'planes',
      });
      expect(catalogOk.success).toBe(true);
      if (catalogOk.success) {
        expect(catalogOk.data.products).toEqual(['Billy IDP', 'CRM Tibs']);
        expect(catalogOk.data.search).toBe('planes');
      }
    });

    it('CheckAvailabilitySchema, CreateActivitySchema & CreateTicketSchema validate dates and lengths', () => {
      expect(CheckAvailabilitySchema.safeParse({ proposedDate: 'mañana a las 3' }).success).toBe(false);
      expect(CheckAvailabilitySchema.safeParse({ proposedDate: '2026-11-25T15:00:00-06:00' }).success).toBe(true);

      expect(
        CreateActivitySchema.safeParse({
          activityText: 'Llamada',
          date: '2026-11-25T15:00:00Z',
          typeActivityId: 1,
          reminderTitle: 'r'.repeat(101),
        }).success,
      ).toBe(false);

      expect(
        CreateTicketSchema.safeParse({
          title: 'Bug',
          description: 'Falla grave',
          priority: 5,
        }).success,
      ).toBe(false);

      expect(Object.keys(AI_AGENT_TOOL_SCHEMAS)).toHaveLength(10);
    });

    it('AiAgentToolsHandlerService.executeTool blocks invalid tool arguments with Zod ERROR before touching services', async () => {
      const oppSvc = { findOne: jest.fn(), update: jest.fn() };
      const handler = new AiAgentToolsHandlerService(
        { manager: { getRepository: jest.fn() } } as any,
        {} as any,
        {} as any,
        oppSvc as any,
        {} as any,
        {} as any,
        {} as any,
        { findOneById: jest.fn().mockResolvedValue(adminUser) } as any,
        {} as any,
        { emit: jest.fn() } as any,
      );

      const badRes = await handler.executeTool(
        'modifyOpportunity',
        { id: 'bad-uuid', montoTotal: -50 },
        { id: 'conv-1', assignedUserId: validUuid2 } as any,
        {} as any,
      );

      expect(badRes.status).toBe('ERROR');
      expect(badRes.details).toBeDefined();
      expect(oppSvc.findOne).not.toHaveBeenCalled();

      oppSvc.findOne.mockResolvedValue({
        id: validUuid1,
        cliente_id: validUuid2,
        opportunityProducts: [],
      });
      oppSvc.update.mockResolvedValue({ id: validUuid1, opportunityProducts: [] });

      const okRes = await handler.executeTool(
        'modifyOpportunity',
        { id: validUuid1, nombreProyecto: 'Propuesta Actualizada', montoTotal: '2500' },
        { id: 'conv-1', clientId: validUuid2, assignedUserId: validUuid2 } as any,
        {} as any,
      );
      expect(okRes.status).toBe('SUCCESS');
      expect(oppSvc.update).toHaveBeenCalledWith(
        validUuid1,
        expect.objectContaining({ nombre_proyecto: 'Propuesta Actualizada', monto_total: 2500 }),
        adminUser,
      );
    });
  });

  describe('Sub-Agents, Channels, Conversations & RBAC', () => {
    it('SaveSubAgentDto validates key regex /^[a-z0-9_]+$/, temperature 0..1 & allowed tool catalog', async () => {
      await expect(
        validateBody(SaveSubAgentDto, {
          key: 'Invalid-Key!',
          name: 'Ventas',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateBody(SaveSubAgentDto, {
          key: 'ventas',
          name: 'Ventas',
          temperature: 1.4,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateBody(SaveSubAgentDto, {
          key: 'ventas',
          name: 'Ventas',
          tools: ['consult_product_catalog', 'drop_database'],
        }),
      ).rejects.toThrow(BadRequestException);

      const ok = await validateBody(SaveSubAgentDto, {
        key: 'ventas_latam',
        name: '  Sub-Agente Ventas  ',
        temperature: 0.4,
        tools: ['consult_product_catalog', 'createOpportunity'],
      });
      expect(ok.key).toBe('ventas_latam');
      expect(ok.name).toBe('Sub-Agente Ventas');
    });

    it('SaveChannelConfigDto, TestReceiveMessageDto, AssignUserDto & UpsertBaseTemplateDto validate constraints', async () => {
      await expect(
        validateBody(SaveChannelConfigDto, { channel: 'tiktok', name: 'Mi Cuenta' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateBody(AssignUserDto, { assignedUserId: 'not-a-uuid' }),
      ).rejects.toThrow(BadRequestException);

      const unassigned = await validateBody(AssignUserDto, { assignedUserId: '' });
      expect(unassigned.assignedUserId).toBeNull();

      await expect(
        validateBody(UpsertBaseTemplateDto, { bodyText: 'Hola {{1}}', headerText: 'h'.repeat(65) }),
      ).rejects.toThrow(BadRequestException);

      const validTestMsg = await validateBody(TestReceiveMessageDto, {
        channel: 'WHATSAPP',
        externalId: '5215512345678',
        clientNickname: 'Juan',
        text: 'Hola quiero cotizar',
      });
      expect(validTestMsg.channel).toBe('whatsapp');
    });

    it('ConversationsController blocks Executive on admin-only config endpoints and validates webhook channel param', async () => {
      const convCtrl = new ConversationsController(
        { verifyMetaWebhook: jest.fn(), handleIncomingWebhook: jest.fn() } as any,
        { saveSubAgent: jest.fn(), deleteSubAgent: jest.fn() } as any,
        { getAuthUrl: jest.fn() } as any,
      );

      await expect(convCtrl.saveSubAgent({ key: 'k', name: 'n' }, execUser)).rejects.toThrow(ForbiddenException);
      await expect(convCtrl.deleteSubAgent(validUuid1, execUser)).rejects.toThrow(ForbiddenException);
      await expect(convCtrl.saveChannel({ channel: 'webchat', name: 'Web' }, execUser)).rejects.toThrow(ForbiddenException);
      await expect(convCtrl.getMetaAuthUrl(execUser, {})).rejects.toThrow(ForbiddenException);
      await expect(
        convCtrl.testReceive({ channel: 'webchat', externalId: '1', clientNickname: 'A', text: 'Hi' }, execUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(convCtrl.handleMetaWebhook('tiktok', {})).rejects.toThrow(BadRequestException);
    });

    it('AiAgentOrchestratorService rejects duplicate sub-agent keys and missing IDs', async () => {
      const subRepo: any = {
        findOne: jest.fn().mockResolvedValue({ id: validUuid2, key: 'comercial' }),
        delete: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      const orch = new AiAgentOrchestratorService(
        {} as any,
        subRepo,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(orch.saveSubAgent({ key: 'comercial', name: 'Comercial' })).rejects.toThrow(ConflictException);
      await expect(orch.deleteSubAgent(validUuid1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('WebChat, Calendar Integrations & OAuth State Safety', () => {
    it('WebchatQueryDto & SendPublicWebchatMessageDto enforce bounds and GetPublicWebchatQueryDto validates query tokens', async () => {
      await expect(
        validateBody(WebchatQueryDto, {
          question: 'Hola',
          conversationHistory: Array.from({ length: 101 }, () => ({ role: 'user', content: 'hi' })),
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validateBody(SendPublicWebchatMessageDto, {
          tenantKey: validUuid1,
          visitorId: 'vis-1',
          text: 't'.repeat(4001),
        }),
      ).rejects.toThrow(BadRequestException);

      const qOk = await validateQuery(GetPublicWebchatQueryDto, { tenantKey: 'mi_verify_token_123' });
      expect(qOk.tenantKey).toBe('mi_verify_token_123');

      const wcCtrl = new WebchatController({} as any, {} as any, {} as any);
      await expect(wcCtrl.getPublicMessages('v'.repeat(151), {})).rejects.toThrow(BadRequestException);
    });

    it('GetCalendarAuthUrlQueryDto rejects invalid providers and OAuth callbacks reject tampered state', async () => {
      await expect(
        validateQuery(GetCalendarAuthUrlQueryDto, { provider: 'icloud' }),
      ).rejects.toThrow(BadRequestException);

      const ok = await validateQuery(GetCalendarAuthUrlQueryDto, { provider: 'GOOGLE' });
      expect(ok.provider).toBe('google');

      const metaOauth = new MetaOauthService(
        { get: jest.fn().mockReturnValue('secret') } as any,
        {} as any,
      );
      const badMetaState = Buffer.from(
        JSON.stringify({ tenantSchema: 'pg_catalog; DROP TABLE users', userId: validUuid1 }),
      ).toString('base64');
      const metaRes = await metaOauth.handleCallback('code-123', badMetaState);
      expect(metaRes.success).toBe(false);
      expect(metaRes.message).toContain('Esquema');

      const redirectMock = jest.fn();
      const calWebhookCtrl = new CalendarWebhooksController(
        { get: jest.fn().mockReturnValue('https://crm.example.com') } as any,
        {} as any,
        { exchangeCode: jest.fn() } as any,
        { exchangeCode: jest.fn() } as any,
        {} as any,
      );
      const badCalState = Buffer.from(
        JSON.stringify({ tenantSchema: 'pg_catalog', userId: validUuid1, provider: 'google' }),
      ).toString('base64');
      await calWebhookCtrl.oauthCallback({ code: 'abc', state: badCalState }, { redirect: redirectMock });
      expect(redirectMock).toHaveBeenCalledWith('https://crm.example.com/settings?calendar_sync=error');
    });
  });
});
