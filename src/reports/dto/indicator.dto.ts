import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateIndicatorDto {
  @ApiProperty({ description: 'Título del indicador', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'Tipo de cálculo del indicador', enum: ['count', 'sum'] })
  @IsOptional()
  @IsIn(['count', 'sum'])
  type?: 'count' | 'sum';

  @ApiPropertyOptional({ description: 'ID del pipeline asociado', format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  pipeline_id?: string | null;

  @ApiPropertyOptional({ description: 'ID de la mesa de ayuda asociada', format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  helpdesk_id?: string | null;

  @ApiPropertyOptional({ description: 'IDs de etapas incluidas en el indicador', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  stage_ids?: string[];

  @ApiPropertyOptional({ description: 'Color identificador del indicador', maxLength: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  color?: string;

  @ApiPropertyOptional({ description: 'Orden de visualización', minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  display_order?: number;
}

export class UpdateIndicatorDto extends PartialType(CreateIndicatorDto) {}
