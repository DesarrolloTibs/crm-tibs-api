import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface RecordAudioTranscriptionInput {
  tenantId?: number | null;
  tenantSchema: string;
  channel: 'whatsapp' | 'messenger' | 'instagram' | 'webchat_interno' | string;
  provider?: string;
  durationSeconds: number;
  audioBytes?: number;
  mimeType?: string | null;
  hasSpeech?: boolean;
  success?: boolean;
  errorMessage?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  userId?: string | null;
  clientId?: string | null;
}

export interface AudioUsageQueryOptions {
  tenantId?: number;
  schemaName?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Servicio dedicado a la auditoría interna de duración y costos de transcripción de audio
 * por tenant (ej. IBM Watson Speech-to-Text).
 *
 * Opera completamente aislado de `transaction_history` para garantizar que la transcripción
 * de IBM Speech-to-Text nunca descuente tokens ni créditos del plan del tenant.
 */
@Injectable()
export class AudioAuditService implements OnModuleInit {
  private readonly logger = new Logger(AudioAuditService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchemaReady();
  }

  /**
   * Asegura de forma idempotente la columna `ibm_audio_enabled` en `public.tenants`
   * y la tabla global `public.audio_transcription_logs`.
   */
  async ensureSchemaReady(): Promise<void> {
    try {
      await this.dataSource.query(`
        ALTER TABLE public.tenants
          ADD COLUMN IF NOT EXISTS ibm_audio_enabled boolean NOT NULL DEFAULT false;

        CREATE TABLE IF NOT EXISTS public.audio_transcription_logs (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          tenant_id integer NULL,
          tenant_schema varchar(63) NOT NULL,
          channel varchar(50) NOT NULL,
          provider varchar(50) NOT NULL DEFAULT 'ibm_stt',
          duration_seconds numeric(10, 2) NOT NULL DEFAULT 0,
          audio_bytes integer NOT NULL DEFAULT 0,
          mime_type varchar(100) NULL,
          has_speech boolean NOT NULL DEFAULT true,
          success boolean NOT NULL DEFAULT true,
          error_message text NULL,
          conversation_id uuid NULL,
          message_id uuid NULL,
          user_id uuid NULL,
          client_id uuid NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_audio_transcription_logs PRIMARY KEY (id)
        );

        CREATE INDEX IF NOT EXISTS idx_audio_logs_tenant_schema_created
          ON public.audio_transcription_logs (tenant_schema, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_audio_logs_tenant_id_created
          ON public.audio_transcription_logs (tenant_id, created_at DESC);
      `);
    } catch (err: any) {
      this.logger.warn(`No se pudo inicializar esquema de auditoría de audio: ${err?.message || err}`);
    }
  }

  /**
   * Registra la duración y metadatos de una transcripción de audio para control interno de costos.
   * No afecta el saldo de tokens del plan del tenant.
   */
  async recordAudioTranscription(input: RecordAudioTranscriptionInput): Promise<void> {
    try {
      let resolvedTenantId = input.tenantId ?? null;
      if (resolvedTenantId === null && input.tenantSchema && input.tenantSchema !== 'public') {
        const rows = await this.dataSource
          .query(`SELECT id FROM public.tenants WHERE schema_name = $1 LIMIT 1`, [input.tenantSchema])
          .catch(() => []);
        if (rows?.[0]?.id !== undefined) {
          resolvedTenantId = Number(rows[0].id);
        }
      }

      const safeDuration = Number.isFinite(input.durationSeconds) && input.durationSeconds > 0
        ? Math.round(input.durationSeconds * 100) / 100
        : 0;

      await this.dataSource.query(
        `INSERT INTO public.audio_transcription_logs (
          tenant_id, tenant_schema, channel, provider, duration_seconds, audio_bytes,
          mime_type, has_speech, success, error_message, conversation_id, message_id, user_id, client_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          resolvedTenantId,
          input.tenantSchema || 'public',
          input.channel,
          input.provider || 'ibm_stt',
          safeDuration,
          input.audioBytes ?? 0,
          input.mimeType || null,
          input.hasSpeech ?? true,
          input.success ?? true,
          input.errorMessage || null,
          input.conversationId || null,
          input.messageId || null,
          input.userId || null,
          input.clientId || null,
        ],
      );
    } catch (err: any) {
      this.logger.error(`Error registrando auditoría de transcripción de audio: ${err?.message || err}`);
    }
  }

  /**
   * Obtiene métricas agregadas de duración y volumen de audios transcritos por tenant y canal
   * para auditoría interna y control de costos del SuperAdmin.
   */
  async getAudioUsageSummary(options: AudioUsageQueryOptions = {}) {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.tenantId !== undefined) {
      params.push(options.tenantId);
      conditions.push(`l.tenant_id = $${params.length}`);
    }
    if (options.schemaName) {
      params.push(options.schemaName);
      conditions.push(`l.tenant_schema = $${params.length}`);
    }
    if (options.startDate) {
      params.push(options.startDate);
      conditions.push(`l.created_at >= $${params.length}`);
    }
    if (options.endDate) {
      params.push(options.endDate);
      conditions.push(`l.created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [totalsRows, byTenantRows, byChannelRows, recentRows] = await Promise.all([
      this.dataSource.query(
        `SELECT
           COUNT(*)::int AS total_requests,
           COUNT(*) FILTER (WHERE l.success = true)::int AS successful_requests,
           COUNT(*) FILTER (WHERE l.has_speech = true AND l.success = true)::int AS speech_detected_requests,
           COALESCE(SUM(l.duration_seconds), 0)::numeric(12, 2) AS total_seconds,
           COALESCE(SUM(l.audio_bytes), 0)::bigint AS total_bytes
         FROM public.audio_transcription_logs l
         ${whereClause}`,
        params,
      ),
      this.dataSource.query(
        `SELECT
           l.tenant_id,
           l.tenant_schema,
           COALESCE(t.name, l.tenant_schema) AS tenant_name,
           COALESCE(t.ibm_audio_enabled, false) AS ibm_audio_enabled,
           COUNT(*)::int AS total_requests,
           COALESCE(SUM(l.duration_seconds), 0)::numeric(12, 2) AS total_seconds
         FROM public.audio_transcription_logs l
         LEFT JOIN public.tenants t ON t.schema_name = l.tenant_schema
         ${whereClause}
         GROUP BY l.tenant_id, l.tenant_schema, t.name, t.ibm_audio_enabled
         ORDER BY total_seconds DESC`,
        params,
      ),
      this.dataSource.query(
        `SELECT
           l.channel,
           COUNT(*)::int AS total_requests,
           COALESCE(SUM(l.duration_seconds), 0)::numeric(12, 2) AS total_seconds
         FROM public.audio_transcription_logs l
         ${whereClause}
         GROUP BY l.channel
         ORDER BY total_seconds DESC`,
        params,
      ),
      this.dataSource.query(
        `SELECT
           l.id,
           l.tenant_id,
           l.tenant_schema,
           l.channel,
           l.provider,
           l.duration_seconds,
           l.audio_bytes,
           l.mime_type,
           l.has_speech,
           l.success,
           l.error_message,
           l.conversation_id,
           l.message_id,
           l.user_id,
           l.client_id,
           l.created_at
         FROM public.audio_transcription_logs l
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT 50`,
        params,
      ),
    ]);

    const totalSeconds = Number(totalsRows[0]?.total_seconds || 0);
    return {
      summary: {
        total_requests: Number(totalsRows[0]?.total_requests || 0),
        successful_requests: Number(totalsRows[0]?.successful_requests || 0),
        speech_detected_requests: Number(totalsRows[0]?.speech_detected_requests || 0),
        total_seconds: totalSeconds,
        total_minutes: Number((totalSeconds / 60).toFixed(2)),
        total_bytes: Number(totalsRows[0]?.total_bytes || 0),
      },
      by_tenant: byTenantRows.map((r: any) => {
        const secs = Number(r.total_seconds || 0);
        return {
          tenant_id: r.tenant_id !== null ? Number(r.tenant_id) : null,
          tenant_schema: r.tenant_schema,
          tenant_name: r.tenant_name,
          ibm_audio_enabled: Boolean(r.ibm_audio_enabled),
          total_requests: Number(r.total_requests || 0),
          total_seconds: secs,
          total_minutes: Number((secs / 60).toFixed(2)),
        };
      }),
      by_channel: byChannelRows.map((r: any) => {
        const secs = Number(r.total_seconds || 0);
        return {
          channel: r.channel,
          total_requests: Number(r.total_requests || 0),
          total_seconds: secs,
          total_minutes: Number((secs / 60).toFixed(2)),
        };
      }),
      recent_logs: recentRows.map((r: any) => ({
        ...r,
        duration_seconds: Number(r.duration_seconds || 0),
        audio_bytes: Number(r.audio_bytes || 0),
      })),
    };
  }
}
