import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiSubAgentMigrationService } from './ai-sub-agent-migration.service';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { AiSubAgent } from './entities/ai-sub-agent.entity';

const mockConfig = { id: 'cfg1', context: null, isActive: true, temperature: 0.7, reminderOffsetMinutes: 60 };

const mockAiAgentConfigRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
  manager: {
    query: jest.fn(),
  },
};

const mockAiSubAgentRepo = {
  find: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('AiSubAgentMigrationService', () => {
  let service: AiSubAgentMigrationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiSubAgentMigrationService,
        { provide: getRepositoryToken(AiAgentConfig), useValue: mockAiAgentConfigRepo },
        { provide: getRepositoryToken(AiSubAgent), useValue: mockAiSubAgentRepo },
      ],
    }).compile();

    service = module.get<AiSubAgentMigrationService>(AiSubAgentMigrationService);
    jest.clearAllMocks();
  });

  // ── runOneTimeSubAgentMigration — first boot ────────────────────────────────

  describe('runOneTimeSubAgentMigration — first boot', () => {
    it('seeds 4 default sub-agents when count is 0', async () => {
      mockAiAgentConfigRepo.manager.query.mockResolvedValue([]);
      mockAiAgentConfigRepo.findOne.mockResolvedValue({ ...mockConfig, context: 'existing' });
      mockAiSubAgentRepo.count.mockResolvedValue(0);
      mockAiSubAgentRepo.create.mockImplementation((d: any) => d);
      mockAiSubAgentRepo.save.mockImplementation((d: any) => Promise.resolve(d));

      await service.runOneTimeSubAgentMigration();

      expect(mockAiSubAgentRepo.save).toHaveBeenCalledTimes(4);
    });

    it('does not seed again when count > 0', async () => {
      mockAiAgentConfigRepo.manager.query.mockResolvedValue([]);
      mockAiAgentConfigRepo.findOne.mockResolvedValue({ ...mockConfig, context: 'existing' });
      mockAiSubAgentRepo.count.mockResolvedValue(4);
      mockAiSubAgentRepo.find.mockResolvedValue([
        { key: 'comercial', context: 'some context', tools: ['sendQuotationPdf'], description: 'desc' },
        { key: 'seguimiento', context: 'context2', tools: [], description: 'desc2' },
        { key: 'soporte_atencion', context: 'context3 requestHumanHandoff NUNCA respondas sólo con final_answer', tools: ['requestHumanHandoff'], description: 'desc3' },
        { key: 'general', context: 'context4', tools: [], description: 'desc4' },
      ]);
      mockAiAgentConfigRepo.find.mockResolvedValue([]);

      await service.runOneTimeSubAgentMigration();

      // No new inserts — only possible updates to existing
      expect(mockAiSubAgentRepo.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ key: 'comercial', tools: expect.not.arrayContaining(['sendQuotationPdf']) }),
      );
    });
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('is idempotent — calling twice with count > 0 does not insert duplicates', async () => {
    mockAiAgentConfigRepo.manager.query.mockResolvedValue([]);
    mockAiAgentConfigRepo.findOne.mockResolvedValue({ ...mockConfig, context: 'some context' });
    mockAiSubAgentRepo.count.mockResolvedValue(4);
    mockAiSubAgentRepo.find.mockResolvedValue([
      { key: 'comercial', context: 'X OBSERVACIONES X', tools: ['sendQuotationPdf'], description: '' },
      { key: 'seguimiento', context: '', tools: [], description: '' },
      { key: 'soporte_atencion', context: 'requestHumanHandoff NUNCA respondas sólo con final_answer', tools: ['requestHumanHandoff'], description: '' },
      { key: 'general', context: '', tools: [], description: '' },
    ]);
    mockAiAgentConfigRepo.find.mockResolvedValue([]);
    mockAiSubAgentRepo.save.mockImplementation((d: any) => Promise.resolve(d));

    await service.runOneTimeSubAgentMigration();
    await service.runOneTimeSubAgentMigration();

    // Each call may update individual agents but should NOT insert 4 new ones
    const insertCallsCount = mockAiSubAgentRepo.create?.mock?.calls?.length ?? 0;
    expect(insertCallsCount).toBe(0);
  });

  // ── onModuleInit ───────────────────────────────────────────────────────────

  it('calls runOneTimeSubAgentMigration on module init', async () => {
    const spy = jest.spyOn(service, 'runOneTimeSubAgentMigration').mockResolvedValue(undefined);
    await service.onModuleInit();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
