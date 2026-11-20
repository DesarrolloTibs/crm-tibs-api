import { IsString, IsNotEmpty, IsUUID, IsOptional, IsInt, Min, Max, IsEmail, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTicketDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  strtitle?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  tipo_incidencia?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @Max(3)
  @IsOptional()
  priority?: number;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  cliente_id?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  responsable_id?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  stage_id?: string;

  @IsString()
  @IsOptional()
  notas_resolucion?: string;

  // External contact fields
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsOptional()
  contactName?: string;

  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(255)
  @IsOptional()
  contactEmail?: string;

  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  @IsOptional()
  contactPhone?: string;

  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsOptional()
  companyName?: string;
}
