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

export class PipelineStageInputDto {
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

  @ApiProperty({ description: 'Orden de visualización en el tablero', minimum: 0 })
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

  @ApiPropertyOptional({ description: 'Tipo de etapa (0 = normal, 1 = ganada, 2 = perdida)', minimum: 0, maximum: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  stage_type?: number;
}

export class UpdateMainPipelineDto {
  @ApiPropertyOptional({ description: 'Nombre del pipeline', maxLength: 120 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  strname?: string;

  @ApiPropertyOptional({ description: 'Descripción del pipeline', maxLength: 500, nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  strdescription?: string | null;

  @ApiPropertyOptional({ description: 'Estado activo del pipeline' })
  @IsOptional()
  @IsBoolean()
  blnstatus?: boolean;

  @ApiPropertyOptional({ description: 'Lista ordenada de etapas del pipeline', type: [PipelineStageInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineStageInputDto)
  stages?: PipelineStageInputDto[];
}
