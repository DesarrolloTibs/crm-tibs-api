import { ForbiddenException, NotImplementedException } from '@nestjs/common';
import { WebchatController } from './webchat.controller';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Role } from '../role.enum';

describe('WebchatController - Audio Support & Gating', () => {
  let controller: WebchatController;
  let speechToTextMock: any;
  let audioAuditMock: any;

  beforeEach(() => {
    speechToTextMock = {
      getAudioPolicy: jest.fn(),
      transcribeWithMetrics: jest.fn(),
    };
    audioAuditMock = {
      recordAudioTranscription: jest.fn().mockResolvedValue(undefined),
    };
    controller = new WebchatController(
      {} as any,
      {} as any,
      speechToTextMock,
      audioAuditMock,
    );
  });

  it('GET /webchat/audio-status returns disabled when global provider is IBM and add-on is false', async () => {
    speechToTextMock.getAudioPolicy.mockResolvedValue({
      globalProvider: 'ibm',
      rawModelProvider: 'watsonx',
      isIbmProvider: true,
      ibmAudioEnabled: false,
      audioAllowed: false,
      tenantId: 3,
      tenantSchema: 'tenant_demo',
    });

    const res = await TenantContextService.run({ tenantSchema: 'tenant_demo' }, () =>
      controller.getAudioStatus({ id: 'u1', role: Role.Executive } as any),
    );

    expect(res).toEqual({
      globalProvider: 'ibm',
      rawModelProvider: 'watsonx',
      usesIbmStt: true,
      ibmAudioEnabled: false,
      audioEnabled: false,
      transcribeEndpointEnabled: false,
    });
  });

  it('POST /webchat/transcribe rejects with ForbiddenException when IBM + add-on is disabled', async () => {
    speechToTextMock.getAudioPolicy.mockResolvedValue({
      globalProvider: 'ibm',
      rawModelProvider: 'watsonx',
      isIbmProvider: true,
      ibmAudioEnabled: false,
      audioAllowed: false,
      tenantId: 3,
      tenantSchema: 'tenant_demo',
    });

    await expect(
      TenantContextService.run({ tenantSchema: 'tenant_demo' }, () =>
        controller.transcribeAudio(
          { id: 'u1', role: Role.Admin } as any,
          [{ buffer: Buffer.from('audio'), mimetype: 'audio/webm' } as any],
        ),
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(speechToTextMock.transcribeWithMetrics).not.toHaveBeenCalled();
    expect(audioAuditMock.recordAudioTranscription).not.toHaveBeenCalled();
  });

  it('POST /webchat/transcribe transcribes and audits duration when IBM + add-on is enabled', async () => {
    speechToTextMock.getAudioPolicy.mockResolvedValue({
      globalProvider: 'ibm',
      rawModelProvider: 'watsonx',
      isIbmProvider: true,
      ibmAudioEnabled: true,
      audioAllowed: true,
      tenantId: 3,
      tenantSchema: 'tenant_demo',
    });
    speechToTextMock.transcribeWithMetrics.mockResolvedValue({
      transcript: 'Muéstrame las ventas del mes',
      durationSeconds: 4.5,
      mimeType: 'audio/wav',
    });

    const res = await TenantContextService.run({ tenantSchema: 'tenant_demo' }, () =>
      controller.transcribeAudio(
        { id: 'u1', role: Role.Executive } as any,
        [{ buffer: Buffer.from('audio-bytes'), mimetype: 'audio/webm' } as any],
      ),
    );

    expect(res).toEqual({
      text: 'Muéstrame las ventas del mes',
      transcript: 'Muéstrame las ventas del mes',
      durationSeconds: 4.5,
    });
    expect(audioAuditMock.recordAudioTranscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 3,
        tenantSchema: 'tenant_demo',
        channel: 'webchat_interno',
        provider: 'ibm_stt',
        durationSeconds: 4.5,
        hasSpeech: true,
        success: true,
        userId: 'u1',
      }),
    );
  });

  it('POST /webchat/transcribe throws NotImplementedException without calling IBM STT when global provider is Gemini', async () => {
    speechToTextMock.getAudioPolicy.mockResolvedValue({
      globalProvider: 'gemini',
      rawModelProvider: 'gemini',
      isIbmProvider: false,
      ibmAudioEnabled: true,
      audioAllowed: true,
      tenantId: null,
      tenantSchema: 'tenant_demo',
    });

    await expect(
      TenantContextService.run({ tenantSchema: 'tenant_demo' }, () =>
        controller.transcribeAudio(
          { id: 'u1', role: Role.Executive } as any,
          [{ buffer: Buffer.from('audio'), mimetype: 'audio/webm' } as any],
        ),
      ),
    ).rejects.toThrow(NotImplementedException);

    expect(speechToTextMock.transcribeWithMetrics).not.toHaveBeenCalled();
  });
});
