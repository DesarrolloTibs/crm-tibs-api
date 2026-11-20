import { IsString, IsNotEmpty, IsUUID, IsOptional, IsInt, Min, Max, IsEmail, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty({ description: 'Título o asunto del ticket', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  strtitle: string;

  @ApiProperty({ description: 'Tipo de incidencia (e.g. Soporte, Facturación)', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  tipo_incidencia: string;

  @ApiProperty({ description: 'Descripción detallada de la incidencia' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Prioridad del ticket (0 a 3 estrellas)', minimum: 0, maximum: 3, default: 1 })
  @IsInt()
  @Min(0)
  @Max(3)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ description: 'ID del cliente registrado', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  cliente_id?: string;

  @ApiPropertyOptional({ description: 'ID del agente responsable asignado', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  responsable_id?: string;

  @ApiPropertyOptional({ description: 'ID de la mesa de ayuda', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  helpdesk_id?: string;

  @ApiPropertyOptional({ description: 'ID de la etapa inicial', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  stage_id?: string;

  @ApiPropertyOptional({ description: 'Notas de resolución' })
  @IsString()
  @IsOptional()
  notas_resolucion?: string;

  // External contact fields
  @ApiPropertyOptional({ description: 'Nombre del contacto externo', maxLength: 255 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsOptional()
  contactName?: string;

  @ApiPropertyOptional({ description: 'Correo del contacto externo', maxLength: 255 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(255)
  @IsOptional()
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Teléfono del contacto externo', maxLength: 50 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Empresa del contacto externo', maxLength: 255 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsOptional()
  companyName?: string;
}
