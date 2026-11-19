import { ConfigService } from '@nestjs/config';
import { SpeechToTextService } from './speech-to-text.service';

describe('SpeechToTextService', () => {
  const buildService = (queryImpl?: jest.Mock, envOverrides: Record<string, string> = {}) => {
    const configService = {
      get: jest.fn((key: string) => envOverrides[key]),
    } as unknown as ConfigService;
    const dataSource = queryImpl ? ({ query: queryImpl } as any) : undefined;
    return new SpeechToTextService(configService, dataSource);
  };

  describe('getAudioPolicy', () => {
    it('returns audioAllowed=false when global provider is IBM (watsonx) and tenant ibm_audio_enabled is false', async () => {
      const queryMock = jest
        .fn()
        .mockResolvedValueOnce([{ modelProvider: 'watsonx' }])
        .mockResolvedValueOnce([{ id: 5, ibm_audio_enabled: false }]);
      const service = buildService(queryMock);

      const policy = await service.getAudioPolicy('tenant_acme');

      expect(policy).toEqual({
        globalProvider: 'ibm',
        rawModelProvider: 'watsonx',
        isIbmProvider: true,
        ibmAudioEnabled: false,
        audioAllowed: false,
        tenantId: 5,
        tenantSchema: 'tenant_acme',
      });
    });

    it('returns audioAllowed=true when global provider is IBM and tenant ibm_audio_enabled is true', async () => {
      const queryMock = jest
        .fn()
        .mockResolvedValueOnce([{ modelProvider: 'ibm' }])
        .mockResolvedValueOnce([{ id: 5, ibm_audio_enabled: true }]);
      const service = buildService(queryMock);

      const policy = await service.getAudioPolicy('tenant_acme');

      expect(policy.isIbmProvider).toBe(true);
      expect(policy.ibmAudioEnabled).toBe(true);
      expect(policy.audioAllowed).toBe(true);
      expect(policy.tenantId).toBe(5);
    });

    it('returns audioAllowed=true without querying tenant add-on when global provider is gemini or openai/azure_openai', async () => {
      const geminiQuery = jest.fn().mockResolvedValueOnce([{ modelProvider: 'gemini' }]);
      const geminiService = buildService(geminiQuery);
      const geminiPolicy = await geminiService.getAudioPolicy('tenant_acme');

      expect(geminiPolicy.globalProvider).toBe('gemini');
      expect(geminiPolicy.isIbmProvider).toBe(false);
      expect(geminiPolicy.audioAllowed).toBe(true);
      expect(geminiQuery).toHaveBeenCalledTimes(1);

      const azureQuery = jest.fn().mockResolvedValueOnce([{ modelProvider: 'openai' }]);
      const azureService = buildService(azureQuery);
      const azurePolicy = await azureService.getAudioPolicy('tenant_acme');

      expect(azurePolicy.globalProvider).toBe('azure_openai');
      expect(azurePolicy.isIbmProvider).toBe(false);
      expect(azurePolicy.audioAllowed).toBe(true);
    });
  });

  describe('extractWavDurationSeconds', () => {
    it('computes exact duration from standard RIFF WAV header', () => {
      // 16kHz, 1ch, 16-bit => byteRate = 32000. 64000 bytes of PCM => 2.00s
      const buf = Buffer.alloc(44 + 64000);
      buf.write('RIFF', 0, 'ascii');
      buf.writeUInt32LE(36 + 64000, 4);
      buf.write('WAVE', 8, 'ascii');
      buf.write('fmt ', 12, 'ascii');
      buf.writeUInt32LE(16, 16);
      buf.writeUInt16LE(1, 20);
      buf.writeUInt16LE(1, 22);
      buf.writeUInt32LE(16000, 24);
      buf.writeUInt32LE(32000, 28);
      buf.writeUInt16LE(2, 32);
      buf.writeUInt16LE(16, 34);
      buf.write('data', 36, 'ascii');
      buf.writeUInt32LE(64000, 40);

      const service = buildService();
      expect(service.extractWavDurationSeconds(buf)).toBe(2);
    });

    it('falls back to remaining buffer bytes when ffmpeg pipe stdout emits 0xFFFFFFFF data size', () => {
      const buf = Buffer.alloc(44 + 48000); // 1.50s at 32000 B/s
      buf.write('RIFF', 0, 'ascii');
      buf.writeUInt32LE(0xffffffff, 4);
      buf.write('WAVE', 8, 'ascii');
      buf.write('fmt ', 12, 'ascii');
      buf.writeUInt32LE(16, 16);
      buf.writeUInt16LE(1, 20);
      buf.writeUInt16LE(1, 22);
      buf.writeUInt32LE(16000, 24);
      buf.writeUInt32LE(32000, 28);
      buf.write('data', 36, 'ascii');
      buf.writeUInt32LE(0xffffffff, 40);

      const service = buildService();
      expect(service.extractWavDurationSeconds(buf)).toBe(1.5);
    });
  });

  describe('transcribeWithMetrics', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('calls IBM Watson STT and returns transcript alongside measured durationSeconds', async () => {
      const wavBuf = Buffer.alloc(44 + 96000); // 3.00s
      wavBuf.write('RIFF', 0, 'ascii');
      wavBuf.write('WAVE', 8, 'ascii');
      wavBuf.write('fmt ', 12, 'ascii');
      wavBuf.writeUInt32LE(16, 16);
      wavBuf.writeUInt32LE(32000, 28);
      wavBuf.write('data', 36, 'ascii');
      wavBuf.writeUInt32LE(96000, 40);

      const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ alternatives: [{ transcript: 'hola quiero una cotización' }] }],
        }),
      } as any);

      const service = buildService(undefined, {
        IBM_SPEECH_TO_TEXT_APIKEY: 'test-key',
        IBM_SPEECH_TO_TEXT_URL: 'https://api.us-south.speech-to-text.watson.cloud.ibm.com',
      });

      const res = await service.transcribeWithMetrics(wavBuf, 'audio/wav');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(res.transcript).toBe('hola quiero una cotización');
      expect(res.durationSeconds).toBe(3);
      expect(res.mimeType).toBe('audio/wav');
    });
  });
});
