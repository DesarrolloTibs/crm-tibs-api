import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  MaxLength,
} from 'class-validator';
import { ActivityType } from '../entities/activity.entity';

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

  @ApiProperty({ description: 'Tipo de actividad', enum: ActivityType })
  @IsEnum(ActivityType)
  @IsNotEmpty()
  activityType: ActivityType;

  @ApiPropertyOptional({
    description: 'ID de la oportunidad asociada (opcional)',
    format: 'uuid',
  })
  // Solo valida como UUID si el valor no es un string vacío.
  @ValidateIf((object, value) => value !== null && value !== '')
  @IsUUID()
  @IsOptional()
  opportunityId?: string | null;
}