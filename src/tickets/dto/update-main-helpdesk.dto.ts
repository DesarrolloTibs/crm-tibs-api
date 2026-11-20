import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HelpdeskStageInputDto {
  @ApiPropertyOptional({ description: 'ID de la etapa existente (si se actualiza)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ description: 'Nombre de la etapa', maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  strname: string;

  @ApiProperty({ description: 'Si la etapa está activa' })
  @IsBoolean()
  blnstatus: boolean;

  @ApiProperty({ description: 'Orden de visualización', minimum: 0 })
  @IsInt()
  @Min(0)
  display_order: number;

  @ApiPropertyOptional({ description: 'Color hexadecimal o etiqueta de color', maxLength: 20, nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  strcolor?: string | null;

  @ApiProperty({ description: 'Indica si es la etapa inicial por defecto' })
  @IsBoolean()
  blninitial: boolean;

  @ApiPropertyOptional({ description: 'Días máximos permitidos en la etapa (0..365)', minimum: 0, maximum: 365, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  intmaxdays?: number | null;

  @ApiPropertyOptional({ description: 'Mostrar etapa en el dashboard' })
  @IsOptional()
  @IsBoolean()
  bln_show_dashboard?: boolean;

  @ApiPropertyOptional({ description: 'Tipo de etapa (0 = abierta, 1 = resuelta/cerrada)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  stage_type?: number;
}

export class UpdateMainHelpdeskDto {
  @ApiPropertyOptional({ description: 'Nombre de la mesa de ayuda', maxLength: 255 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  strname?: string;

  @ApiPropertyOptional({ description: 'Descripción de la mesa de ayuda', maxLength: 2000, nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  strdescription?: string | null;

  @ApiPropertyOptional({ description: 'Lista ordenada de etapas de la mesa de ayuda', type: [HelpdeskStageInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HelpdeskStageInputDto)
  stages?: HelpdeskStageInputDto[];
}
