import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
  IsNotEmpty,
  IsIn,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ALLOWED_CHANNEL_TYPES = ['whatsapp', 'facebook', 'instagram', 'webchat', 'messenger'] as const;

export class AssignUserDto {
  @ApiPropertyOptional({ description: 'ID del ejecutivo asignado (o null para desasignar)', format: 'uuid', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsUUID('4', { message: 'assignedUserId debe ser un UUID válido.' })
  assignedUserId?: string | null;
}

export class ToggleBotStatusDto {
  @ApiProperty({ description: 'Activa o desactiva el bot en la conversación' })
  @IsBoolean()
  botActive: boolean;
}

export class SendManualMessageDto {
  @ApiProperty({ description: 'Contenido del mensaje manual', maxLength: 4096 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El contenido del mensaje no puede estar vacío.' })
  @MaxLength(4096, { message: 'El mensaje no debe exceder 4096 caracteres.' })
  content: string;
}

export class SendTemplateMessageDto {
  @ApiProperty({ description: 'Nombre técnico de la plantilla en Meta', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  templateName: string;

  @ApiPropertyOptional({ description: 'Código de idioma de la plantilla (ej. es, es_MX)', maxLength: 20 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  @IsOptional()
  languageCode?: string;

  @ApiPropertyOptional({ description: 'Componentes de parámetros de la plantilla', type: [Object] })
  @IsArray()
  @IsOptional()
  components?: any[];

  @ApiPropertyOptional({ description: 'Texto interpolado de vista previa', maxLength: 4096 })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  content?: string;
}

export class UpsertBaseTemplateDto {
  @ApiProperty({ description: 'Contenido principal del mensaje', maxLength: 1024 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'bodyText es obligatorio.' })
  @MaxLength(1024, { message: 'bodyText no debe exceder 1024 caracteres.' })
  bodyText: string;

  @ApiPropertyOptional({ description: 'Encabezado opcional de texto plano', maxLength: 60 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60, { message: 'headerText no debe exceder 60 caracteres.' })
  @IsOptional()
  headerText?: string;

  @ApiPropertyOptional({ description: 'Pie de mensaje opcional', maxLength: 60 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60, { message: 'footerText no debe exceder 60 caracteres.' })
  @IsOptional()
  footerText?: string;
}

export class SelectExistingBaseTemplateDto {
  @ApiProperty({ description: 'Nombre técnico de la plantilla aprobada en Meta', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  templateName: string;

  @ApiPropertyOptional({ description: 'ID oficial de plantilla en Meta', maxLength: 100 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  @IsOptional()
  templateId?: string;

  @ApiPropertyOptional({ description: 'Idioma de la plantilla', maxLength: 20 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ description: 'Categoría en Meta', maxLength: 50 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Cuerpo de texto de la plantilla', maxLength: 2048 })
  @IsString()
  @MaxLength(2048)
  @IsOptional()
  bodyText?: string;
}

export class ConnectWhatsAppEmbeddedDto {
  @ApiProperty({ description: 'Código temporal OAuth de Embedded Signup', maxLength: 2048 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  code: string;

  @ApiProperty({ description: 'WhatsApp Business Account ID (WABA)', maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  wabaId: string;

  @ApiProperty({ description: 'WhatsApp Phone Number ID', maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  phoneNumberId: string;

  @ApiPropertyOptional({ description: 'Nombre amigable del canal', maxLength: 255 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;
}

export class SaveChannelConfigDto {
  @ApiPropertyOptional({ description: 'ID del canal existente (si se actualiza)', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsUUID('4', { message: 'El ID del canal debe ser un UUID válido.' })
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({ description: 'Tipo de canal omnicanal', enum: ALLOWED_CHANNEL_TYPES })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @ValidateIf((o) => !o.id || o.channel !== undefined)
  @IsString()
  @IsIn(ALLOWED_CHANNEL_TYPES, { message: 'El canal debe ser whatsapp, facebook, instagram, webchat o messenger.' })
  @MaxLength(50)
  channel?: string;

  @ApiPropertyOptional({ description: 'Nombre descriptivo de la cuenta', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o) => !o.id || o.name !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del canal es obligatorio.' })
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(255)
  appId?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(255)
  accountId?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(255)
  phoneNumberId?: string | null;

  @ApiPropertyOptional({ maxLength: 2048, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(2048)
  accessToken?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(255)
  verifyToken?: string | null;

  @ApiPropertyOptional({ description: 'Estado activo/inactivo del canal' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class TestReceiveMessageDto {
  @ApiProperty({ enum: ALLOWED_CHANNEL_TYPES })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsIn(ALLOWED_CHANNEL_TYPES)
  channel: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  externalId: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  clientNickname: string;

  @ApiProperty({ maxLength: 4096 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text: string;

  @ApiPropertyOptional({ enum: ['text', 'audio', 'image', 'document'] })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsIn(['text', 'audio', 'image', 'document'])
  @IsOptional()
  messageType?: string;
}

export class GetMetaAuthUrlQueryDto {
  @ApiPropertyOptional({ enum: ['facebook', 'instagram'] })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsIn(['facebook', 'instagram'])
  @IsOptional()
  channel?: string;
}

export class GetTemplatesQueryDto {
  @ApiPropertyOptional({ enum: ['true', 'false', '1', '0'] })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsIn(['true', 'false', '1', '0'])
  @IsOptional()
  all?: string;
}
