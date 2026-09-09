import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';

export class AssignUserDto {
  @IsString()
  @IsOptional()
  assignedUserId?: string | null;
}

export class ToggleBotStatusDto {
  @IsBoolean()
  botActive: boolean;
}

export class SendManualMessageDto {
  @IsString()
  content: string;
}

export class SendTemplateMessageDto {
  @IsString()
  templateName: string;

  @IsString()
  @IsOptional()
  languageCode?: string; // Default 'es' o 'es_MX'

  @IsArray()
  @IsOptional()
  components?: any[];

  @IsString()
  @IsOptional()
  content?: string;
}

export class UpsertBaseTemplateDto {
  @IsString()
  bodyText: string; // Contenido principal del mensaje. Por defecto: 'Hola {{1}}'

  @IsString()
  @IsOptional()
  headerText?: string; // Encabezado opcional de texto plano

  @IsString()
  @IsOptional()
  footerText?: string; // Pie de mensaje opcional
}

export class SelectExistingBaseTemplateDto {
  @IsString()
  templateName: string;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  bodyText?: string;
}

