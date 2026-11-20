import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsEnum,
  IsNumber,
  Min,
  IsOptional,
  IsDateString,
  IsArray,
  IsInt,
  Max,
  MaxLength,
  IsIn,
  ValidateNested,
  ValidateBy,
  ValidationArguments,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '../entities/opportunity.entity';

export const ALLOWED_OPPORTUNITY_CHANNELS = ['whatsapp', 'facebook', 'instagram', 'webchat', 'manual'] as const;

export class ProductItemDto {
  @ApiProperty({ description: 'ID del producto', format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ description: 'Cantidad del producto', minimum: 0.01, maximum: 999999, type: Number })
  @IsNumber()
  @Min(0.01)
  @Max(999999)
  @IsOptional()
  cantidad?: number;
}

export class CreateOpportunityDto {
  @ApiProperty({ description: 'Nombre del proyecto', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre_proyecto: string;

  @ApiProperty({ description: 'Descripción de la oportunidad', maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @ApiPropertyOptional({ description: 'ID del cliente', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  cliente_id?: string;

  @ApiPropertyOptional({ description: 'Empresa asociada al proyecto (texto libre)', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsOptional()
  empresa?: string;

  @ApiPropertyOptional({ description: 'ID de la empresa asociada', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Arreglo de IDs de contactos asociados', type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  contactIds?: string[];

  @ApiPropertyOptional({ description: 'ID del ejecutivo asignado', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string;

  @ApiPropertyOptional({ description: 'ID de la etapa de la oportunidad', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  stage_id?: string;

  @ApiPropertyOptional({ description: 'ID del pipeline de la oportunidad', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  pipeline_id?: string;

  @ApiPropertyOptional({ description: 'Monto de licenciamiento', minimum: 0, maximum: 99999999.99, type: Number })
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  @IsOptional()
  monto_licenciamiento?: number;

  @ApiPropertyOptional({ description: 'Monto de servicios', minimum: 0, maximum: 99999999.99, type: Number })
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
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

  @ApiPropertyOptional({ description: 'Monto total', minimum: 0, maximum: 99999999.99, type: Number })
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  @IsOptional()
  monto_total?: number;

  @ApiPropertyOptional({ description: 'ID del licenciamiento', format: 'uuid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  licenciamiento_id?: string;

  @ApiPropertyOptional({ description: 'Tipo de cambio, mayor a 0 si la moneda es USD', minimum: 0, maximum: 99999999.99, type: Number })
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  @ValidateBy({
    name: 'positiveExchangeRateForUsd',
    validator: {
      validate(value: any, args?: ValidationArguments) {
        const obj = args?.object as { moneda?: Currency } | undefined;
        if (obj?.moneda === Currency.USD && value !== undefined && value !== null) {
          return typeof value === 'number' && value > 0;
        }
        return true;
      },
      defaultMessage() {
        return 'El tipoCambio debe ser mayor a 0 cuando la moneda es USD.';
      },
    },
  })
  @IsOptional()
  tipoCambio?: number;

  @ApiPropertyOptional({ description: 'Fecha de creación de la oportunidad' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  @IsOptional()
  createdAt?: Date;

  @ApiPropertyOptional({ description: 'Fecha estimada de cierre' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  @IsOptional()
  estimated_closure_date?: Date;

  @ApiPropertyOptional({ description: 'Fecha en que ingresó a la etapa actual' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  @IsOptional()
  stage_entered_at?: Date;

  @ApiPropertyOptional({ description: 'Arreglo de IDs de productos asociados (legacy, cantidad=1)', type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  productIds?: string[];

  @ApiPropertyOptional({ description: 'Productos con cantidad', type: [ProductItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductItemDto)
  @IsOptional()
  productItems?: ProductItemDto[];

  @ApiPropertyOptional({ description: 'Prioridad del proyecto (0 a 3 estrellas)', minimum: 0, maximum: 3, type: Number })
  @IsInt()
  @Min(0)
  @Max(3)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ description: 'Canal de origen de la oportunidad', enum: ALLOWED_OPPORTUNITY_CHANNELS, example: 'manual' })
  @IsString()
  @MaxLength(50)
  @IsIn(ALLOWED_OPPORTUNITY_CHANNELS)
  @IsOptional()
  canal_origen?: string;
}

