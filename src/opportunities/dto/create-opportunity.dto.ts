import { IsString, IsNotEmpty, IsUUID, IsEnum, IsNumber, Min, IsOptional, IsDateString, IsArray } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '../entities/opportunity.entity';

export class CreateOpportunityDto {
  @ApiProperty({ description: 'Nombre del proyecto' })
  @IsString()
  @IsNotEmpty()
  nombre_proyecto: string;

  @ApiProperty({ description: 'Descripción de la oportunidad' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'ID del cliente', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  cliente_id?: string;

  @ApiPropertyOptional({ description: 'Empresa asociada al proyecto (texto libre)' })
  @IsString()
  @IsOptional()
  empresa?: string;

  @ApiPropertyOptional({ description: 'ID de la empresa asociada', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Arreglo de IDs de contactos asociados', type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  contactIds?: string[];


  @ApiPropertyOptional({ description: 'ID del ejecutivo asignado', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string;

  @ApiPropertyOptional({ description: 'ID de la etapa de la oportunidad', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  stage_id?: string;

  @ApiPropertyOptional({ description: 'ID del pipeline de la oportunidad', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  pipeline_id?: string;

  @ApiPropertyOptional({ description: 'Monto de licenciamiento', minimum: 0, type: Number })
  @IsNumber()
  @Min(0)
  @IsOptional()
  monto_licenciamiento?: number;

  @ApiPropertyOptional({ description: 'Monto de servicios', minimum: 0, type: Number })
  @IsNumber()
  @Min(0)
  @IsOptional()
  monto_servicios?: number;

  @ApiProperty({ description: 'Moneda', enum: Currency })
  @IsEnum(Currency)
  @IsNotEmpty()
  moneda: Currency;

  @ApiProperty({ description: 'ID de la línea de negocio', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  linea_negocio_id: string;

  @ApiProperty({ description: 'ID del tipo de entrega', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  tipo_entrega_id: string;

  @ApiPropertyOptional({ description: 'Monto total', minimum: 0, type: Number })
  @IsNumber()
  @Min(0)
  @IsOptional()
  monto_total?: number;
  
  @ApiPropertyOptional({ description: 'ID del licenciamiento', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  licenciamiento_id?: string;

  @ApiPropertyOptional({ description: 'Tipo de cambio, solo aplica si la moneda es USD', type: Number })
  @IsNumber()
  @Min(0)
  @IsOptional()
  tipoCambio?: number;

  @ApiPropertyOptional({ description: 'Fecha de creación de la oportunidad' })
  @IsDateString()
  @IsOptional()
  createdAt?: Date;

  @ApiPropertyOptional({ description: 'Fecha estimada de cierre' })
  @IsDateString()
  @IsOptional()
  estimated_closure_date?: Date;

  @ApiPropertyOptional({ description: 'Fecha en que ingresó a la etapa actual' })
  @IsDateString()
  @IsOptional()
  stage_entered_at?: Date;

  @ApiPropertyOptional({ description: 'Arreglo de IDs de productos asociados', type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  productIds?: string[];
}
