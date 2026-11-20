import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  Min,
  IsOptional,
  IsDateString,
  IsArray,
  IsEnum,
  IsInt,
  Max,
  MaxLength,
  IsIn,
  ValidateNested,
  ValidateBy,
  ValidationArguments,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Currency } from '../entities/opportunity.entity';
import { ALLOWED_OPPORTUNITY_CHANNELS, ProductItemDto } from './create-opportunity.dto';

export class UpdateOpportunityDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  nombre_proyecto?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  cliente_id?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsOptional()
  empresa?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  contactIds?: string[];

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  stage_id?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  pipeline_id?: string;

  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  @IsOptional()
  monto_licenciamiento?: number;

  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  @IsOptional()
  monto_servicios?: number;

  @IsEnum(Currency)
  @IsOptional()
  moneda?: Currency;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  linea_negocio_id?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  tipo_entrega_id?: string;

  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  @IsOptional()
  monto_total?: number;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  @IsOptional()
  licenciamiento_id?: string;

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

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  @IsOptional()
  estimated_closure_date?: Date;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  @IsOptional()
  createdAt?: Date;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  @IsOptional()
  stage_entered_at?: Date;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  productIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductItemDto)
  @IsOptional()
  productItems?: ProductItemDto[];

  @IsInt()
  @Min(0)
  @Max(3)
  @IsOptional()
  priority?: number;

  @IsString()
  @MaxLength(50)
  @IsIn(ALLOWED_OPPORTUNITY_CHANNELS)
  @IsOptional()
  canal_origen?: string;
}