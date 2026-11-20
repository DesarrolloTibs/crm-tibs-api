import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { spawn } from 'child_process';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { normalizeSpokenSpanishText } from '../common/utils/spoken-spanish.util';
const ffmpegPath = require('ffmpeg-static');

export type GlobalAudioProvider = 'ibm' | 'azure_openai' | 'gemini';

export interface AudioPolicyResult {
  globalProvider: GlobalAudioProvider;
  rawModelProvider: string;
  isIbmProvider: boolean;
  ibmAudioEnabled: boolean;
  audioAllowed: boolean;
  tenantId: number | null;
  tenantSchema: string;
}

export interface TranscribeAudioResult {
  transcript: string | null;
  durationSeconds: number;
  mimeType: string;
}

@Injectable()
export class SpeechToTextService {
  private readonly logger = new Logger(SpeechToTextService.name);

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  normalizeProvider(raw?: string | null): GlobalAudioProvider {
    const clean = (raw || 'watsonx').toString().toLowerCase().trim();
    if (clean === 'watsonx' || clean === 'ibm') return 'ibm';
    if (clean === 'openai' || clean === 'azure_openai' || clean === 'azure') return 'azure_openai';
    if (clean === 'gemini') return 'gemini';
    return 'gemini';
  }

  /**
   * Resuelve el proveedor global de IA configurado en `public.ai_agent_configs`
   * (con fallback al esquema del tenant o a `MODEL_PROVIDER`).
   */
  async getGlobalProviderInfo(tenantSchema?: string): Promise<{
    globalProvider: GlobalAudioProvider;
    rawModelProvider: string;
    isIbmProvider: boolean;
  }> {
    let rawModelProvider = '';

    if (this.dataSource) {
      try {
        const publicRows = await this.dataSource.query(
          `SELECT "modelProvider" FROM public.ai_agent_configs LIMIT 1`,
        );
        if (publicRows?.[0]?.modelProvider) {
          rawModelProvider = String(publicRows[0].modelProvider);
        }
      } catch (err: any) {
        this.logger.warn(`No se pudo consultar proveedor global en public.ai_agent_configs: ${err?.message || err}`);
      }

      if (!rawModelProvider && tenantSchema && tenantSchema !== 'public' && TenantContextService.validateSchemaName(tenantSchema)) {
        try {
          const tenantRows = await this.dataSource.query(
            `SELECT "modelProvider" FROM "${tenantSchema}".ai_agent_configs LIMIT 1`,
          );
          if (tenantRows?.[0]?.modelProvider) {
            rawModelProvider = String(tenantRows[0].modelProvider);
          }
        } catch {
          // Ignorar si no existe configuración local del tenant
        }
      }
    }

    if (!rawModelProvider) {
      rawModelProvider = this.configService.get<string>('MODEL_PROVIDER') || 'watsonx';
    }

    const globalProvider = this.normalizeProvider(rawModelProvider);
    return {
      globalProvider,
      rawModelProvider,
      isIbmProvider: globalProvider === 'ibm',
    };
  }

  /**
   * Evalúa la política de soporte de audio aplicable al tenant activo según el proveedor global
   * y la bandera `public.tenants.ibm_audio_enabled`.
   */
  async getAudioPolicy(tenantSchemaOverride?: string): Promise<AudioPolicyResult> {
    const tenantSchema = tenantSchemaOverride || TenantContextService.getTenantSchema() || 'public';
    const providerInfo = await this.getGlobalProviderInfo(tenantSchema);

    if (!providerInfo.isIbmProvider) {
      return {
        ...providerInfo,
        ibmAudioEnabled: true,
        audioAllowed: true,
        tenantId: null,
        tenantSchema,
      };
    }

    if (!tenantSchema || tenantSchema === 'public' || !this.dataSource) {
      return {
        ...providerInfo,
        ibmAudioEnabled: false,
        audioAllowed: false,
        tenantId: null,
        tenantSchema,
      };
    }

    try {
      const rows = await this.dataSource.query(
        `SELECT id, ibm_audio_enabled FROM public.tenants WHERE schema_name = $1 LIMIT 1`,
        [tenantSchema],
      );
      if (!rows || rows.length === 0) {
        return {
          ...providerInfo,
          ibmAudioEnabled: false,
          audioAllowed: false,
          tenantId: null,
          tenantSchema,
        };
      }
      const ibmAudioEnabled = Boolean(rows[0].ibm_audio_enabled);
      return {
        ...providerInfo,
        ibmAudioEnabled,
        audioAllowed: ibmAudioEnabled,
        tenantId: rows[0].id !== undefined ? Number(rows[0].id) : null,
        tenantSchema,
      };
    } catch (err: any) {
      this.logger.warn(`Error consultando ibm_audio_enabled para ${tenantSchema}: ${err?.message || err}`);
      return {
        ...providerInfo,
        ibmAudioEnabled: false,
        audioAllowed: false,
        tenantId: null,
        tenantSchema,
      };
    }
  }

  normalizeSpokenNumbersAndEmail(text: string): string {
    return normalizeSpokenSpanishText(text);
  }

  /**
   * Convierte un búfer de audio (ej. MP4, M4A, AAC, WebM, contenedores de video)
   * a formato estándar WAV (16kHz mono) soportado al 100% por IBM Watson.
   */
  private async convertToWav(inputBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', 'pipe:0',  // Lee desde stdin
        '-vn',           // Descarta pistas de video si existen
        '-ar', '16000',  // Frecuencia de muestreo 16kHz recomendada para Speech-to-Text
        '-ac', '1',      // 1 canal (mono)
        '-f', 'wav',     // Formato de salida WAV (PCM lineal de 16 bits)
        'pipe:1',        // Escribe a stdout
      ]);

      const chunks: Buffer[] = [];
      ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      ffmpeg.stderr.on('data', () => {});
      ffmpeg.stdin.on('error', () => {});

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg finalizó con código ${code}`));
        }
      });

      ffmpeg.on('error', (err: Error) => reject(err));
      ffmpeg.stdin.write(inputBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Calcula la duración exacta en segundos a partir de un búfer WAV (RIFF/WAVE),
   * tolerando tamaños de chunk no buscables (`0xFFFFFFFF`) generados por stdout de FFmpeg.
   */
  extractWavDurationSeconds(wavBuffer: Buffer): number {
    if (!wavBuffer || wavBuffer.length < 44) return 0;
    if (wavBuffer.toString('ascii', 0, 4) !== 'RIFF' || wavBuffer.toString('ascii', 8, 12) !== 'WAVE') {
      return 0;
    }

    let offset = 12;
    let byteRate = 0;
    let dataSize = 0;

    while (offset + 8 <= wavBuffer.length) {
      const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = wavBuffer.readUInt32LE(offset + 4);

      if (chunkId === 'fmt ' && chunkSize >= 16 && offset + 8 + 12 <= wavBuffer.length) {
        byteRate = wavBuffer.readUInt32LE(offset + 16);
      } else if (chunkId === 'data') {
        const remaining = wavBuffer.length - (offset + 8);
        if (chunkSize === 0xffffffff || chunkSize === 0 || chunkSize > remaining) {
          dataSize = Math.max(0, remaining);
        } else {
          dataSize = chunkSize;
        }
        break;
      }

      if (chunkSize === 0xffffffff) break;
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (byteRate <= 0 || dataSize <= 0) return 0;
    return Math.round((dataSize / byteRate) * 100) / 100;
  }

  private parseTimeStringToSeconds(h: string, m: string, s: string): number {
    const total = parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
    return Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0;
  }

  /**
   * Obtiene la duración del audio en segundos decodificándolo con FFmpeg hacia null sink.
   */
  async probeDurationSeconds(audioBuffer: Buffer): Promise<number> {
    if (!audioBuffer || audioBuffer.length === 0) return 0;

    const wavDur = this.extractWavDurationSeconds(audioBuffer);
    if (wavDur > 0) return wavDur;

    return new Promise((resolve) => {
      let stderrOutput = '';
      let settled = false;
      const done = (secs: number) => {
        if (!settled) {
          settled = true;
          resolve(secs);
        }
      };

      try {
        const ffmpeg = spawn(ffmpegPath, ['-i', 'pipe:0', '-f', 'null', '-']);
        const timeout = setTimeout(() => {
          try { ffmpeg.kill(); } catch {}
          done(0);
        }, 10000);

        ffmpeg.stderr.on('data', (chunk: Buffer) => {
          stderrOutput += chunk.toString('utf8');
        });
        ffmpeg.stdin.on('error', () => {});
        ffmpeg.on('error', () => {
          clearTimeout(timeout);
          done(0);
        });
        ffmpeg.on('close', () => {
          clearTimeout(timeout);
          const timeMatches = [...stderrOutput.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
          if (timeMatches.length > 0) {
            const last = timeMatches[timeMatches.length - 1];
            const parsed = this.parseTimeStringToSeconds(last[1], last[2], last[3]);
            if (parsed > 0) return done(parsed);
          }
          const durationMatch = stderrOutput.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
          if (durationMatch) {
            return done(this.parseTimeStringToSeconds(durationMatch[1], durationMatch[2], durationMatch[3]));
          }
          done(0);
        });

        ffmpeg.stdin.write(audioBuffer);
        ffmpeg.stdin.end();
      } catch {
        done(0);
      }
    });
  }

  /**
   * Mide la duración de un búfer de audio sin invocar servicios externos de transcripción.
   */
  async measureAudioDurationSeconds(audioBuffer: Buffer, wavBuffer?: Buffer): Promise<number> {
    if (wavBuffer) {
      const wavDur = this.extractWavDurationSeconds(wavBuffer);
      if (wavDur > 0) return wavDur;
    }
    return this.probeDurationSeconds(audioBuffer);
  }

  /**
   * Transcribe un búfer de audio a texto utilizando IBM Watson Speech to Text y calcula
   * su duración en segundos para auditoría interna de costos.
   */
  async transcribeWithMetrics(audioBuffer: Buffer, rawMimeType?: string): Promise<TranscribeAudioResult> {
    const apiKey = this.configService.get<string>('IBM_SPEECH_TO_TEXT_APIKEY');
    const baseUrl = this.configService.get<string>('IBM_SPEECH_TO_TEXT_URL');
    const model = this.configService.get<string>('IBM_SPEECH_TO_TEXT_MODEL') || 'es-MX_BroadbandModel';

    if (!apiKey || !baseUrl) {
      this.logger.error('Credenciales de IBM Speech to Text (APIKEY o URL) no configuradas en el entorno');
      throw new Error('IBM Speech to Text no está configurado');
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      this.logger.warn('Se recibió un búfer de audio vacío para transcripción');
      return { transcript: null, durationSeconds: 0, mimeType: rawMimeType || 'audio/ogg;codecs=opus' };
    }

    let audioToSend = audioBuffer;
    let transcodedWavBuffer: Buffer | undefined;
    let cleanMimeType = (rawMimeType || 'audio/ogg;codecs=opus').toLowerCase().trim();
    cleanMimeType = cleanMimeType.replace(/;\s+/g, ';');

    const isMp4AacOrWebm =
      cleanMimeType.includes('mp4') ||
      cleanMimeType.includes('m4a') ||
      cleanMimeType.includes('aac') ||
      cleanMimeType.includes('webm') ||
      cleanMimeType.includes('video') ||
      cleanMimeType.includes('quicktime');

    if (isMp4AacOrWebm) {
      try {
        this.logger.log(
          `[SpeechToText] Detectado contenedor ${cleanMimeType}. Transcodificando a WAV 16kHz mono con FFmpeg...`,
        );
        audioToSend = await this.convertToWav(audioBuffer);
        transcodedWavBuffer = audioToSend;
        cleanMimeType = 'audio/wav';
        this.logger.log(`[SpeechToText] Transcodificación completada con éxito: ${audioToSend.length} bytes (WAV)`);
      } catch (convErr: any) {
        this.logger.warn(
          `[SpeechToText] No se pudo transcodificar con FFmpeg: ${convErr.message}. Se intentará envío directo.`,
        );
      }
    } else if (cleanMimeType.includes('ogg') || cleanMimeType.includes('opus')) {
      cleanMimeType = 'audio/ogg;codecs=opus';
    } else if (cleanMimeType.includes('mpeg') || cleanMimeType.includes('mp3')) {
      cleanMimeType = 'audio/mpeg';
    } else if (cleanMimeType.includes('wav')) {
      cleanMimeType = 'audio/wav';
    }

    const durationSeconds = await this.measureAudioDurationSeconds(audioBuffer, transcodedWavBuffer);

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const endpoint = `${normalizedBaseUrl}/v1/recognize?model=${encodeURIComponent(model)}&smart_formatting=true`;
    const authHeader = `Basic ${Buffer.from(`apikey:${apiKey}`).toString('base64')}`;

    this.logger.log(
      `[SpeechToText] Enviando audio a IBM Watson (${audioToSend.length} bytes, duración: ${durationSeconds}s, MIME: ${cleanMimeType}, Modelo: ${model})...`,
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': cleanMimeType,
        },
        body: new Uint8Array(audioToSend) as unknown as BodyInit,
        signal: AbortSignal.timeout(25000), // 25 segundos de timeout
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        this.logger.error(
          `[SpeechToText] Error de IBM Watson Speech to Text (HTTP ${response.status}): ${errorBody}`,
        );
        const err: any = new Error(`IBM Speech to Text devolvió status ${response.status}`);
        err.durationSeconds = durationSeconds;
        err.mimeType = cleanMimeType;
        throw err;
      }

      const data: any = await response.json();
      const results = data?.results;

      if (!results || !Array.isArray(results) || results.length === 0) {
        this.logger.warn('[SpeechToText] IBM Watson procesó el audio pero no detectó habla (audio silencioso o inaudible)');
        return { transcript: null, durationSeconds, mimeType: cleanMimeType };
      }

      const transcripts: string[] = [];
      for (const res of results) {
        const alternative = res?.alternatives?.[0];
        if (alternative?.transcript) {
          transcripts.push(alternative.transcript.trim());
        }
      }

      const rawTranscript = transcripts.filter(Boolean).join(' ').trim();
      if (!rawTranscript) {
        this.logger.warn('[SpeechToText] Las alternativas de IBM Watson no contienen texto válido');
        return { transcript: null, durationSeconds, mimeType: cleanMimeType };
      }

      const fullTranscript = this.normalizeSpokenNumbersAndEmail(rawTranscript);
      this.logger.log(`[SpeechToText] Audio transcrito exitosamente (${durationSeconds}s): "${fullTranscript}"`);
      return { transcript: fullTranscript, durationSeconds, mimeType: cleanMimeType };
    } catch (error: any) {
      if (error.durationSeconds === undefined) {
        error.durationSeconds = durationSeconds;
        error.mimeType = cleanMimeType;
      }
      this.logger.error(`[SpeechToText] Excepción transcribiendo audio con IBM Watson: ${error.message}`);
      throw error;
    }
  }

  /**
   * Transcribe un búfer de audio a texto utilizando IBM Watson Speech to Text.
   * Si el audio viene en MP4, M4A, AAC, WebM o contenedor incompatible (común en Instagram/Messenger/Navegadores),
   * lo transcodifica automáticamente a WAV 16kHz mono antes de enviarlo a IBM.
   *
   * @param audioBuffer Búfer binario del archivo de audio
   * @param rawMimeType Tipo MIME del audio recibido de Meta o del cliente
   * @returns Texto transcrito limpio o null si no se detectó habla
   */
  async transcribeAudio(audioBuffer: Buffer, rawMimeType?: string): Promise<string | null> {
    const result = await this.transcribeWithMetrics(audioBuffer, rawMimeType);
    return result.transcript;
  }
}
