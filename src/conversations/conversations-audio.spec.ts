import { ConversationsService } from './conversations.service';
import { SpeechToTextService } from './speech-to-text.service';
import { AudioAuditService } from '../subscriptions/audio-audit.service';

describe('ConversationsService - Audio Gating & Auditing', () => {
  const createService = () => {
    const conversationRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => ({ id: 'conv-1', ...v })),
      save: jest.fn(async (v) => ({ id: 'conv-1', ...v })),
      manager: {
        query: jest.fn(),
      },
    };
    const messageRepo = {
      create: jest.fn((v) => ({ id: 'msg-1', ...v })),
      save: jest.fn(async (v) => ({ id: 'msg-1', ...v })),
      findOne: jest.fn(async ({ where }: any) => ({ id: where?.id || 'msg-1', conversationId: 'conv-1' })),
    };
    const clientRepo = {
      create: jest.fn((v) => ({ id: 'client-1', ...v })),
      save: jest.fn(async (v) => ({ id: 'client-1', ...v })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const userRepo = {};
    const channelConfigRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'ch-1',
        channel: 'whatsapp',
        accessToken: 'meta-token',
        phoneNumberId: 'phone-1',
        accountId: 'page-1',
        isActive: true,
      }),
      manager: {
        query: jest.fn().mockResolvedValue([{ schema_name: 'tenant_acme' }]),
      },
    };
    const templateRepo = {};
    const gateway = {
      emitMessage: jest.fn(),
      emitMessageStatusUpdated: jest.fn(),
    };
    const aiAgentService = {
      getOrInitConfig: jest.fn().mockResolvedValue({ defaultUserId: 'user-1' }),
      processIncomingMessage: jest.fn(),
    };
    const eventEmitter = { emit: jest.fn() };
    const clientsService = {
      findByPhone: jest.fn().mockResolvedValue({ id: 'client-1', nombre: 'Juan', apellido: 'Pérez' }),
    };
    const cacheManager = { get: jest.fn(), set: jest.fn() };
    const speechToTextService: Partial<SpeechToTextService> = {
      getAudioPolicy: jest.fn(),
      transcribeWithMetrics: jest.fn(),
      measureAudioDurationSeconds: jest.fn().mockResolvedValue(4.2),
    };
    const storageService = {
      saveBuffer: jest.fn().mockResolvedValue('/uploads/conversations/audios/test.ogg'),
    };
    const audioAuditService: Partial<AudioAuditService> = {
      recordAudioTranscription: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ConversationsService(
      conversationRepo as any,
      messageRepo as any,
      clientRepo as any,
      userRepo as any,
      channelConfigRepo as any,
      templateRepo as any,
      gateway as any,
      aiAgentService as any,
      eventEmitter as any,
      clientsService as any,
      cacheManager as any,
      speechToTextService as any,
      storageService as any,
      audioAuditService as any,
    );

    return {
      service,
      conversationRepo,
      messageRepo,
      channelConfigRepo,
      aiAgentService,
      speechToTextService,
      storageService,
      audioAuditService,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('WhatsApp + IBM + add-on disabled: skips audio download, skips IBM STT, skips LLM, saves audio_unsupported and replies asking for text', async () => {
    const {
      service,
      speechToTextService,
      storageService,
      audioAuditService,
      aiAgentService,
      messageRepo,
      conversationRepo,
    } = createService();

    jest.spyOn(service, 'findTenantSchemaByChannelConfig').mockResolvedValue('tenant_acme');
    (speechToTextService.getAudioPolicy as jest.Mock).mockResolvedValue({
      globalProvider: 'ibm',
      rawModelProvider: 'watsonx',
      isIbmProvider: true,
      ibmAudioEnabled: false,
      audioAllowed: false,
      tenantId: 10,
      tenantSchema: 'tenant_acme',
    });

    const downloadSpy = jest.spyOn(service, 'downloadWhatsAppAudio');
    const outboundSpy = jest.spyOn(service as any, 'sendOutboundMessage').mockResolvedValue({ success: true });
    const debounceSpy = jest.spyOn(service as any, 'scheduleAiReplyDebounce');

    conversationRepo.findOne
      .mockResolvedValueOnce(null) // receiveIncomingMessage finds/creates conv
      .mockResolvedValueOnce({ id: 'conv-1', channel: 'whatsapp', externalId: '5215512345678', botActive: true }); // sendAudioDisabledReply

    await service.handleIncomingWebhook('whatsapp', {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-1' },
                contacts: [{ profile: { name: 'Ana' } }],
                messages: [{ id: 'wamid-1', from: '5215512345678', type: 'audio', audio: { id: 'media-99' } }],
              },
            },
          ],
        },
      ],
    });

    expect(downloadSpy).not.toHaveBeenCalled();
    expect(storageService.saveBuffer).not.toHaveBeenCalled();
    expect(speechToTextService.transcribeWithMetrics).not.toHaveBeenCalled();
    expect(audioAuditService.recordAudioTranscription).not.toHaveBeenCalled();
    expect(debounceSpy).not.toHaveBeenCalled();
    expect(aiAgentService.processIncomingMessage).not.toHaveBeenCalled();
    expect(messageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: 'contact',
        messageType: 'audio_unsupported',
        mediaUrl: null,
      }),
    );
    expect(outboundSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('envíame un mensaje escrito'),
      expect.anything(),
    );
  });

  it('Messenger + IBM + add-on enabled: downloads audio, transcribes via IBM STT, audits duration without token charge, and triggers AI debounce', async () => {
    const {
      service,
      speechToTextService,
      storageService,
      audioAuditService,
      conversationRepo,
    } = createService();

    jest.spyOn(service, 'findTenantSchemaByChannelConfig').mockResolvedValue('tenant_acme');
    (speechToTextService.getAudioPolicy as jest.Mock).mockResolvedValue({
      globalProvider: 'ibm',
      rawModelProvider: 'watsonx',
      isIbmProvider: true,
      ibmAudioEnabled: true,
      audioAllowed: true,
      tenantId: 10,
      tenantSchema: 'tenant_acme',
    });

    jest.spyOn(global, 'fetch' as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ first_name: 'Luis', last_name: 'Gomez' }),
    } as any);

    jest.spyOn(service, 'downloadMessengerInstagramAudio').mockResolvedValue({
      buffer: Buffer.from('fake-audio-data'),
      mimeType: 'audio/mp4',
    });
    const debounceSpy = jest.spyOn(service as any, 'scheduleAiReplyDebounce').mockImplementation(() => {});
    conversationRepo.findOne
      .mockResolvedValueOnce({
        id: 'conv-1',
        channel: 'messenger',
        externalId: 'psid-1',
        clientId: 'client-1',
        botActive: true,
      })
      .mockResolvedValueOnce({
        id: 'conv-1',
        channel: 'messenger',
        externalId: 'psid-1',
        clientId: 'client-1',
        botActive: true,
      });

    (speechToTextService.transcribeWithMetrics as jest.Mock).mockResolvedValue({
      transcript: 'Quiero información de precios',
      durationSeconds: 6.45,
      mimeType: 'audio/wav',
    });

    await service.handleIncomingWebhook('messenger', {
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'psid-1' },
              message: {
                mid: 'mid-1',
                attachments: [{ type: 'audio', payload: { url: 'https://cdn.fbsbx.com/audio.mp4' } }],
              },
            },
          ],
        },
      ],
    });

    expect(storageService.saveBuffer).toHaveBeenCalledTimes(1);
    expect(speechToTextService.transcribeWithMetrics).toHaveBeenCalledTimes(1);
    expect(audioAuditService.recordAudioTranscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 10,
        tenantSchema: 'tenant_acme',
        channel: 'messenger',
        provider: 'ibm_stt',
        durationSeconds: 6.45,
        hasSpeech: true,
        success: true,
        clientId: 'client-1',
      }),
    );
    expect(debounceSpy).toHaveBeenCalledWith('conv-1');
  });

  it('Instagram + global provider Gemini: never blocks by add-on and never calls IBM STT', async () => {
    const {
      service,
      speechToTextService,
      storageService,
      audioAuditService,
      conversationRepo,
    } = createService();

    jest.spyOn(service, 'findTenantSchemaByChannelConfig').mockResolvedValue('tenant_acme');
    (speechToTextService.getAudioPolicy as jest.Mock).mockResolvedValue({
      globalProvider: 'gemini',
      rawModelProvider: 'gemini',
      isIbmProvider: false,
      ibmAudioEnabled: true,
      audioAllowed: true,
      tenantId: null,
      tenantSchema: 'tenant_acme',
    });

    jest.spyOn(global, 'fetch' as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: 'ig_user' }),
    } as any);
    jest.spyOn(service, 'downloadMessengerInstagramAudio').mockResolvedValue({
      buffer: Buffer.from('ig-audio'),
      mimeType: 'audio/mp4',
    });
    const debounceSpy = jest.spyOn(service as any, 'scheduleAiReplyDebounce').mockImplementation(() => {});
    conversationRepo.findOne.mockResolvedValueOnce({
      id: 'conv-1',
      channel: 'instagram',
      externalId: 'ig-1',
      botActive: true,
    });

    await service.handleIncomingWebhook('instagram', {
      entry: [
        {
          id: 'ig-acc-1',
          messaging: [
            {
              sender: { id: 'ig-1' },
              message: {
                mid: 'mid-ig-1',
                attachments: [{ type: 'audio', payload: { url: 'https://cdn.instagram.com/audio.mp4' } }],
              },
            },
          ],
        },
      ],
    });

    expect(storageService.saveBuffer).toHaveBeenCalledTimes(1);
    expect(speechToTextService.transcribeWithMetrics).not.toHaveBeenCalled();
    expect(audioAuditService.recordAudioTranscription).not.toHaveBeenCalled();
    expect(debounceSpy).not.toHaveBeenCalled();
  });

  it('findAll sanitizes assignedUser and lastMessage.senderUser and uses safe field projection', async () => {
    const { service, conversationRepo, messageRepo } = createService();

    const convQb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'conv-1',
          channel: 'messenger',
          externalId: 'psid-1',
          assignedUserId: 'user-1',
          assignedUser: {
            id: 'user-1',
            username: 'admin',
            email: 'admin@tibs.com',
            role: 'admin',
            isActive: true,
            profileImageUrl: null,
            password: 'hashed-password-secret',
            resetPasswordToken: 'reset-token-secret',
            resetPasswordExpires: new Date('2026-12-01T00:00:00Z'),
          },
          lastCustomerMessageAt: new Date(),
        },
      ]),
    };

    const msgQb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      distinctOn: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          sender: 'agent',
          senderUserId: 'user-1',
          senderUser: {
            id: 'user-1',
            username: 'admin',
            email: 'admin@tibs.com',
            role: 'admin',
            isActive: true,
            profileImageUrl: null,
            password: 'hashed-password-secret',
            resetPasswordToken: 'reset-token-secret',
            resetPasswordExpires: new Date('2026-12-01T00:00:00Z'),
          },
          content: 'Hola',
          createdAt: new Date(),
        },
      ]),
    };

    (conversationRepo as any).createQueryBuilder = jest.fn().mockReturnValue(convQb);
    (messageRepo as any).createQueryBuilder = jest.fn().mockReturnValue(msgQb);

    const result = await service.findAll(undefined, true);

    expect(convQb.leftJoinAndSelect).not.toHaveBeenCalledWith('c.assignedUser', expect.anything());
    expect(convQb.leftJoin).toHaveBeenCalledWith('c.assignedUser', 'assignedUser');
    expect(convQb.addSelect).toHaveBeenCalledWith(
      expect.arrayContaining([
        'assignedUser.id',
        'assignedUser.username',
        'assignedUser.email',
        'assignedUser.role',
        'assignedUser.isActive',
        'assignedUser.profileImageUrl',
      ]),
    );

    expect(msgQb.leftJoinAndSelect).not.toHaveBeenCalledWith('m.senderUser', expect.anything());
    expect(msgQb.leftJoin).toHaveBeenCalledWith('m.senderUser', 'senderUser');
    expect(msgQb.addSelect).toHaveBeenCalledWith(
      expect.arrayContaining([
        'senderUser.id',
        'senderUser.username',
        'senderUser.email',
        'senderUser.role',
        'senderUser.isActive',
        'senderUser.profileImageUrl',
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].assignedUser).toEqual({
      id: 'user-1',
      username: 'admin',
      email: 'admin@tibs.com',
      role: 'admin',
      isActive: true,
      profileImageUrl: null,
    });
    expect(result[0].assignedUser).not.toHaveProperty('password');
    expect(result[0].assignedUser).not.toHaveProperty('resetPasswordToken');
    expect(result[0].assignedUser).not.toHaveProperty('resetPasswordExpires');

    expect(result[0].lastMessage?.senderUser).toEqual({
      id: 'user-1',
      username: 'admin',
      email: 'admin@tibs.com',
      role: 'admin',
      isActive: true,
      profileImageUrl: null,
    });
    expect(result[0].lastMessage?.senderUser).not.toHaveProperty('password');
    expect(result[0].lastMessage?.senderUser).not.toHaveProperty('resetPasswordToken');
    expect(result[0].lastMessage?.senderUser).not.toHaveProperty('resetPasswordExpires');
  });
});
