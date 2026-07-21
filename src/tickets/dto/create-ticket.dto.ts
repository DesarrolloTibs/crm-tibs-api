import { IsString, IsNotEmpty, IsUUID, IsOptional, IsInt, Min, Max, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty({ description: 'Título o asunto del ticket' })
  @IsString()
  @IsNotEmpty()
  strtitle: string;

  @ApiProperty({ description: 'Tipo de incidencia (e.g. Soporte, Facturación)' })
  @IsString()
  @IsNotEmpty()
  tipo_incidencia: string;

  @ApiProperty({ description: 'Descripción detallada de la incidencia' })
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
  @IsUUID()
  @IsOptional()
  cliente_id?: string;

  @ApiPropertyOptional({ description: 'ID del agente responsable asignado', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  responsable_id?: string;

  @ApiPropertyOptional({ description: 'ID de la mesa de ayuda', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  helpdesk_id?: string;

  @ApiPropertyOptional({ description: 'ID de la etapa inicial', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  stage_id?: string;

  @ApiPropertyOptional({ description: 'Notas de resolución' })
  @IsString()
  @IsOptional()
  notas_resolucion?: string;

  // External contact fields
  @ApiPropertyOptional({ description: 'Nombre del contacto externo' })
  @IsString()
  @IsOptional()
  contactName?: string;

  @ApiPropertyOptional({ description: 'Correo del contacto externo' })
  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Teléfono del contacto externo' })
  @IsString()
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Empresa del contacto externo' })
  @IsString()
  @IsOptional()
  companyName?: string;
}
