import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
const ffmpegPath = require('ffmpeg-static');

@Injectable()
export class SpeechToTextService {
  private readonly logger = new Logger(SpeechToTextService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Convierte un búfer de audio (ej. MP4, M4A, AAC, contenedores de video)
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
   * Transcribe un búfer de audio a texto utilizando IBM Watson Speech to Text.
   * Si el audio viene en MP4, M4A, AAC o contenedor incompatible (común en Instagram/Messenger),
   * lo transcodifica automáticamente a WAV 16kHz mono antes de enviarlo a IBM.
   *
   * @param audioBuffer Búfer binario del archivo de audio
   * @param rawMimeType Tipo MIME del audio recibido de Meta o del cliente
   * @returns Texto transcrito limpio o null si no se detectó habla
   */
  async transcribeAudio(audioBuffer: Buffer, rawMimeType?: string): Promise<string | null> {
    const apiKey = this.configService.get<string>('IBM_SPEECH_TO_TEXT_APIKEY');
    const baseUrl = this.configService.get<string>('IBM_SPEECH_TO_TEXT_URL');
    const model = this.configService.get<string>('IBM_SPEECH_TO_TEXT_MODEL') || 'es-MX_BroadbandModel';

    if (!apiKey || !baseUrl) {
      this.logger.error('Credenciales de IBM Speech to Text (APIKEY o URL) no configuradas en el entorno');
      throw new Error('IBM Speech to Text no está configurado');
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      this.logger.warn('Se recibió un búfer de audio vacío para transcripción');
      return null;
    }

    let audioToSend = audioBuffer;
    let cleanMimeType = (rawMimeType || 'audio/ogg;codecs=opus').toLowerCase().trim();
    cleanMimeType = cleanMimeType.replace(/;\s+/g, ';');

    // Instagram y Facebook Messenger suelen enviar notas de voz en contenedores MP4/M4A con AAC o video/mp4.
    // IBM Watson rechaza audio/mp4 con HTTP 415, por lo que transcodificamos a WAV nativo de forma transparente.
    const isMp4OrAac =
      cleanMimeType.includes('mp4') ||
      cleanMimeType.includes('m4a') ||
      cleanMimeType.includes('aac') ||
      cleanMimeType.includes('video') ||
      cleanMimeType.includes('quicktime');

    if (isMp4OrAac) {
      try {
        this.logger.log(
          `[SpeechToText] Detectado contenedor ${cleanMimeType}. Transcodificando a WAV 16kHz mono con FFmpeg...`,
        );
        audioToSend = await this.convertToWav(audioBuffer);
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

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const endpoint = `${normalizedBaseUrl}/v1/recognize?model=${encodeURIComponent(model)}`;
    const authHeader = `Basic ${Buffer.from(`apikey:${apiKey}`).toString('base64')}`;

    this.logger.log(
      `[SpeechToText] Enviando audio a IBM Watson (${audioToSend.length} bytes, MIME: ${cleanMimeType}, Modelo: ${model})...`,
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
        throw new Error(`IBM Speech to Text devolvió status ${response.status}`);
      }

      const data: any = await response.json();
      const results = data?.results;

      if (!results || !Array.isArray(results) || results.length === 0) {
        this.logger.warn('[SpeechToText] IBM Watson procesó el audio pero no detectó habla (audio silencioso o inaudible)');
        return null;
      }

      const transcripts: string[] = [];
      for (const res of results) {
        const alternative = res?.alternatives?.[0];
        if (alternative?.transcript) {
          transcripts.push(alternative.transcript.trim());
        }
      }

      const fullTranscript = transcripts.filter(Boolean).join(' ').trim();
      if (!fullTranscript) {
        this.logger.warn('[SpeechToText] Las alternativas de IBM Watson no contienen texto válido');
        return null;
      }

      this.logger.log(`[SpeechToText] Audio transcrito exitosamente: "${fullTranscript}"`);
      return fullTranscript;
    } catch (error: any) {
      this.logger.error(`[SpeechToText] Excepción transcribiendo audio con IBM Watson: ${error.message}`);
      throw error;
    }
  }
}
