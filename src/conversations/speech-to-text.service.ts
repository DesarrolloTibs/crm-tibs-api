import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
const ffmpegPath = require('ffmpeg-static');

@Injectable()
export class SpeechToTextService {
  private readonly logger = new Logger(SpeechToTextService.name);

  constructor(private readonly configService: ConfigService) {}

  normalizeSpokenNumbersAndEmail(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let result = text.trim();

    if (/\barroba\b/i.test(result)) {
      result = result
        .replace(/\s+arroba\s+/gi, '@')
        .replace(/(\S+)\s+punto\s+(\S+)/gi, '$1.$2')
        .replace(/(\S+)\s+guion\s+bajo\s+(\S+)/gi, '$1_$2')
        .replace(/(\S+)\s+guion\s+(\S+)/gi, '$1-$2');
    }

    const unitsAndTeens: Record<string, number> = {
      cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
      seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
      trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
      dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21,
      veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
      veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
    };
    const tens: Record<string, number> = {
      treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
      setenta: 70, ochenta: 80, noventa: 90,
    };
    const hundreds: Record<string, number> = {
      cien: 100, ciento: 100, doscientos: 200, doscientas: 200,
      trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
      quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
      setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
      novecientos: 900, novecientas: 900,
    };

    const normWord = (w: string) =>
      w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const tokens = result.split(/\s+/);

    const parseSubHundred = (idx: number): { val: string; nextIdx: number } | null => {
      if (idx >= tokens.length) return null;
      const w = normWord(tokens[idx]);
      if (unitsAndTeens[w] !== undefined) {
        return { val: String(unitsAndTeens[w]), nextIdx: idx + 1 };
      }
      if (tens[w] !== undefined) {
        const base = tens[w];
        if (idx + 2 < tokens.length && normWord(tokens[idx + 1]) === 'y') {
          const u = normWord(tokens[idx + 2]);
          if (unitsAndTeens[u] !== undefined && unitsAndTeens[u] >= 1 && unitsAndTeens[u] <= 9) {
            return { val: String(base + unitsAndTeens[u]), nextIdx: idx + 3 };
          }
        }
        return { val: String(base), nextIdx: idx + 1 };
      }
      return null;
    };

    const parseNumberGroup = (idx: number): { val: string; nextIdx: number } | null => {
      if (idx >= tokens.length) return null;
      const w = normWord(tokens[idx]);
      if (/^\d+$/.test(w)) {
        return { val: w, nextIdx: idx + 1 };
      }
      if (hundreds[w] !== undefined) {
        const hVal = hundreds[w];
        if (w === 'cien') {
          return { val: '100', nextIdx: idx + 1 };
        }
        const sub = parseSubHundred(idx + 1);
        if (sub) {
          return { val: String(hVal + parseInt(sub.val, 10)), nextIdx: sub.nextIdx };
        }
        return { val: String(hVal), nextIdx: idx + 1 };
      }
      return parseSubHundred(idx);
    };

    const out: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const groups: string[] = [];
      let curr = i;
      while (curr < tokens.length) {
        const g = parseNumberGroup(curr);
        if (!g) break;
        groups.push(g.val);
        curr = g.nextIdx;
      }
      const joined = groups.join('');
      if (groups.length >= 2 && joined.length >= 7 && joined.length <= 15) {
        out.push(joined);
        i = curr;
      } else {
        out.push(tokens[i]);
        i++;
      }
    }
    return out.join(' ');
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
   * Si el audio viene en MP4, M4A, AAC, WebM o contenedor incompatible (común en Instagram/Messenger/Navegadores),
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

    // Instagram, Facebook Messenger y navegadores web (MediaRecorder) suelen enviar notas de voz en contenedores MP4/M4A/AAC/WebM.
    // IBM Watson rechaza audio/mp4 con HTTP 415 o ciertos contenedores WebM, por lo que transcodificamos a WAV nativo de forma transparente.
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
    const endpoint = `${normalizedBaseUrl}/v1/recognize?model=${encodeURIComponent(model)}&smart_formatting=true`;
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
