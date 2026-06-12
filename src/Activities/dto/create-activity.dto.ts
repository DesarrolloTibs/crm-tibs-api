import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  MaxLength,
  IsBoolean,
  IsInt,
} from 'class-validator';

export class CreateActivityDto {
  @ApiProperty({ description: 'Fecha de la actividad' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ description: 'Descripción de la actividad', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  activity: string;

  @ApiProperty({ description: 'ID del tipo de actividad' })
  @IsInt()
  @IsNotEmpty()
  typeActivityId: number;

  @ApiPropertyOptional({
    description: 'ID de la oportunidad asociada (opcional)',
    format: 'uuid',
  })
  // Solo valida como UUID si el valor no es un string vacío.
  @ValidateIf((object, value) => value !== null && value !== '')
  @IsUUID()
  @IsOptional()
  opportunityId?: string | null;

  @ApiPropertyOptional({
    description: 'ID del cliente asociado (opcional)',
    format: 'uuid',
  })
  @ValidateIf((object, value) => value !== null && value !== '')
  @IsUUID()
  @IsOptional()
  clientId?: string | null;

  @ApiPropertyOptional({ description: 'Indicador de historial (opcional)' })
  @IsBoolean()
  @IsOptional()
  flaghistory?: boolean;
}

  