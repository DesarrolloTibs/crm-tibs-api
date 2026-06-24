import { IsString, IsUUID, IsOptional, IsInt, Min, Max, IsEmail } from 'class-validator';

export class UpdateTicketDto {
  @IsString()
  @IsOptional()
  strtitle?: string;

  @IsString()
  @IsOptional()
  tipo_incidencia?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @Max(3)
  @IsOptional()
  priority?: number;

  @IsUUID()
  @IsOptional()
  cliente_id?: string;

  @IsUUID()
  @IsOptional()
  responsable_id?: string;

  @IsUUID()
  @IsOptional()
  stage_id?: string;

  @IsString()
  @IsOptional()
  notas_resolucion?: string;

  // External contact fields
  @IsString()
  @IsOptional()
  contactName?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  companyName?: string;
}
