import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const AI_MODEL_PROVIDERS = ['gemini', 'openai', 'watsonx'] as const;

export const ALLOWED_AI_AGENT_TOOLS = [
  'registerContact',
  'updateContact',
  'createOpportunity',
  'modifyOpportunity',
  'checkAvailability',
  'createActivity',
  'createTicket',
  'consult_product_catalog',
  'sendQuotationPdf',
  'requestHumanHandoff',
] as const;

export class UpdateAiConfigDto {
  @ApiPropertyOptional({ description: 'ID del registro de configuración (ignorado en escritura)' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({ description: 'Activa o desactiva el agente IA para el tenant' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Contexto/prompt base del router del agente IA' })
  @IsString()
  @MaxLength(20000, { message: 'El contexto no debe exceder 20,000 caracteres.' })
  @IsOptional()
  context?: string | null;

  @ApiPropertyOptional({ description: 'Respuestas predeterminadas del agente' })
  @IsString()
  @MaxLength(10000, { message: 'Las respuestas predeterminadas no deben exceder 10,000 caracteres.' })
  @IsOptional()
  defaultReplies?: string | null;

  @ApiPropertyOptional({ description: 'Temperatura del modelo (0 a 1)', minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0, { message: 'temperature debe ser mayor o igual a 0.' })
  @Max(1, { message: 'temperature no puede ser mayor a 1.' })
  @IsOptional()
  temperature?: number;

  @ApiPropertyOptional({ description: 'Minutos de anticipación para recordatorios internos', minimum: 1, maximum: 1440 })
  @IsInt({ message: 'reminderOffsetMinutes debe ser un número entero.' })
  @Min(1, { message: 'reminderOffsetMinutes debe ser al menos 1.' })
  @Max(1440, { message: 'reminderOffsetMinutes no debe exceder 1440 minutos.' })
  @IsOptional()
  reminderOffsetMinutes?: number;

  @ApiPropertyOptional({ description: 'Cantidad de mensajes previos en memoria conversacional (3 a 50)', minimum: 3, maximum: 50 })
  @IsInt({ message: 'historyMessageLimit debe ser un número entero.' })
  @Min(3, { message: 'historyMessageLimit debe ser al menos 3.' })
  @Max(50, { message: 'historyMessageLimit no debe exceder 50.' })
  @IsOptional()
  historyMessageLimit?: number;

  @ApiPropertyOptional({ description: 'Usuario responsable por defecto del agente', format: 'uuid', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsUUID()
  @IsOptional()
  defaultUserId?: string | null;

  // --- Parámetros globales (uso exclusivo de SuperAdmin) ---

  @ApiPropertyOptional({ enum: AI_MODEL_PROVIDERS, description: 'Proveedor global de IA (solo SuperAdmin)' })
  @IsIn(AI_MODEL_PROVIDERS, { message: 'modelProvider debe ser gemini, openai o watsonx.' })
  @IsOptional()
  modelProvider?: string;

  @ApiPropertyOptional({ description: 'Nombre del modelo LLM global (solo SuperAdmin)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsString()
  @MaxLength(100, { message: 'modelName no debe exceder 100 caracteres.' })
  @IsOptional()
  modelName?: string;

  @ApiPropertyOptional({ description: 'API Key global de OpenAI / Azure OpenAI (solo SuperAdmin)', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(255, { message: 'openaiApiKey no debe exceder 255 caracteres.' })
  @IsOptional()
  openaiApiKey?: string | null;

  @ApiPropertyOptional({ description: 'Endpoint URL de Azure OpenAI u OpenAI compatible (solo SuperAdmin)', nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'openaiEndpoint debe ser una URL http/https válida.' })
  @MaxLength(512, { message: 'openaiEndpoint no debe exceder 512 caracteres.' })
  @IsOptional()
  openaiEndpoint?: string | null;

  @ApiPropertyOptional({ description: 'Versión de API de Azure OpenAI (solo SuperAdmin)', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(50, { message: 'openaiApiVersion no debe exceder 50 caracteres.' })
  @IsOptional()
  openaiApiVersion?: string | null;

  @ApiPropertyOptional({ description: 'Modelo de embeddings de OpenAI (solo SuperAdmin)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsString()
  @MaxLength(100, { message: 'openaiEmbeddingModel no debe exceder 100 caracteres.' })
  @IsOptional()
  openaiEmbeddingModel?: string;

  @ApiPropertyOptional({ description: 'API Key global de Google Gemini (solo SuperAdmin)', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(255, { message: 'geminiApiKey no debe exceder 255 caracteres.' })
  @IsOptional()
  geminiApiKey?: string | null;

  @ApiPropertyOptional({ description: 'API Key global de IBM Watsonx (solo SuperAdmin)', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(255, { message: 'watsonxApiKey no debe exceder 255 caracteres.' })
  @IsOptional()
  watsonxApiKey?: string | null;

  @ApiPropertyOptional({ description: 'Project ID global de IBM Watsonx (solo SuperAdmin)', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(255, { message: 'watsonxProjectId no debe exceder 255 caracteres.' })
  @IsOptional()
  watsonxProjectId?: string | null;

  @ApiPropertyOptional({ description: 'Región global de IBM Watsonx (solo SuperAdmin)', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(100, { message: 'watsonxRegion no debe exceder 100 caracteres.' })
  @IsOptional()
  watsonxRegion?: string | null;

  @ApiPropertyOptional({ description: 'Modelo de embeddings de IBM Watsonx (solo SuperAdmin)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsString()
  @MaxLength(100, { message: 'watsonxEmbeddingModel no debe exceder 100 caracteres.' })
  @IsOptional()
  watsonxEmbeddingModel?: string;

  @ApiPropertyOptional({ description: 'Máximo de tokens de salida global (100 a 32768, solo SuperAdmin)', minimum: 100, maximum: 32768 })
  @IsInt({ message: 'maxNewTokens debe ser un número entero.' })
  @Min(100, { message: 'maxNewTokens debe ser al menos 100.' })
  @Max(32768, { message: 'maxNewTokens no debe exceder 32768.' })
  @IsOptional()
  maxNewTokens?: number;
}

export class SaveSubAgentDto {
  @ApiPropertyOptional({ description: 'ID del sub-agente (si se actualiza uno existente)', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsUUID('4', { message: 'El ID del sub-agente debe ser un UUID válido.' })
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({ description: 'Clave identificadora del sub-agente (minúsculas, números y _)', maxLength: 50, example: 'comercial' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @ValidateIf((o) => !o.id || o.key !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'La clave (key) del sub-agente es obligatoria.' })
  @MaxLength(50, { message: 'La clave (key) no debe exceder 50 caracteres.' })
  @Matches(/^[a-z0-9_]+$/, {
    message: 'La clave (key) del sub-agente solo puede contener letras minúsculas, números y guión bajo (_).',
  })
  key?: string;

  @ApiProperty({ description: 'Nombre visible del sub-agente', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o) => !o.id || o.name !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del sub-agente es obligatorio.' })
  @MaxLength(255, { message: 'El nombre del sub-agente no debe exceder 255 caracteres.' })
  name?: string;

  @ApiPropertyOptional({ description: 'Descripción funcional del sub-agente', maxLength: 2000 })
  @Transform(({ value }) => (value === '' ? '' : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000, { message: 'La descripción no debe exceder 2000 caracteres.' })
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Prompt de instrucciones (contexto) del sub-agente', maxLength: 25000, nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(25000, { message: 'El prompt/contexto del sub-agente no debe exceder 25,000 caracteres.' })
  context?: string | null;

  @ApiPropertyOptional({
    description: 'Herramientas permitidas para el sub-agente',
    enum: ALLOWED_AI_AGENT_TOOLS,
    isArray: true,
    nullable: true,
  })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsArray({ message: 'tools debe ser un arreglo de nombres de herramientas.' })
  @IsString({ each: true })
  @IsIn(ALLOWED_AI_AGENT_TOOLS, {
    each: true,
    message: 'Todas las herramientas en tools deben pertenecer al catálogo oficial del agente.',
  })
  tools?: string[] | null;

  @ApiPropertyOptional({ description: 'Temperatura del sub-agente (0 a 1)', minimum: 0, maximum: 1 })
  @IsNumber({}, { message: 'temperature debe ser un número válido.' })
  @Min(0, { message: 'temperature debe ser mayor o igual a 0.' })
  @Max(1, { message: 'temperature no puede ser mayor a 1.' })
  @IsOptional()
  temperature?: number;

  @ApiPropertyOptional({ description: 'Estado activo del sub-agente' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
