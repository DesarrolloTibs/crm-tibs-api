import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateAllowExtraDto {
  @ApiProperty({ example: true, description: 'Habilita o deshabilita el consumo de tokens extra fuera de cuota' })
  @IsBoolean({ message: 'El campo allowExtra debe ser booleano (true o false).' })
  allowExtra: boolean;
}

export class TenantConsumptionQueryDto {
  @ApiPropertyOptional({ description: 'Nombre del esquema PostgreSQL de la organización' })
  @IsOptional()
  @IsString()
  @MaxLength(63)
  @Matches(/^[a-z0-9_]+$/, { message: 'schemaName contiene caracteres inválidos.' })
  schemaName?: string;

  @ApiPropertyOptional({ description: 'ID numérico de la organización' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tenantId debe ser un número entero.' })
  @IsPositive({ message: 'tenantId debe ser mayor a 0.' })
  tenantId?: number;
}

export class TenantBreakdownQueryDto extends TenantConsumptionQueryDto {
  @ApiPropertyOptional({ description: 'ID del ciclo de facturación' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cycleId debe ser un número entero.' })
  @IsPositive({ message: 'cycleId debe ser mayor a 0.' })
  cycleId?: number;

  @ApiPropertyOptional({ description: 'Fecha inicial en formato ISO 8601' })
  @IsOptional()
  @IsDateString({}, { message: 'startDate debe tener formato de fecha ISO válido.' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Fecha final en formato ISO 8601' })
  @IsOptional()
  @IsDateString({}, { message: 'endDate debe tener formato de fecha ISO válido.' })
  endDate?: string;
}

export class TenantAudioUsageQueryDto {
  @ApiPropertyOptional({ description: 'Nombre del esquema PostgreSQL de la organización' })
  @IsOptional()
  @IsString()
  @MaxLength(63)
  @Matches(/^[a-z0-9_]+$/, { message: 'schemaName contiene caracteres inválidos.' })
  schemaName?: string;

  @ApiPropertyOptional({ description: 'ID numérico de la organización' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tenantId debe ser un número entero.' })
  @IsPositive({ message: 'tenantId debe ser mayor a 0.' })
  tenantId?: number;

  @ApiPropertyOptional({ description: 'Fecha inicial en formato ISO 8601' })
  @IsOptional()
  @IsDateString({}, { message: 'startDate debe tener formato de fecha ISO válido.' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Fecha final en formato ISO 8601' })
  @IsOptional()
  @IsDateString({}, { message: 'endDate debe tener formato de fecha ISO válido.' })
  endDate?: string;
}
