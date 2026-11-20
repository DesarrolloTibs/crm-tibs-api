import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsBoolean,
  IsInt,
  IsPositive,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ActivityReminderDto } from './activity-reminder.dto';

export class CreateActivityDto {
  @ApiProperty({ description: 'Fecha de la actividad' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ description: 'Descripción de la actividad', maxLength: 5000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  activity: string;

  @ApiProperty({ description: 'ID del tipo de actividad', minimum: 1 })
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  typeActivityId: number;

  @ApiPropertyOptional({
    description: 'ID de la oportunidad asociada (opcional)',
    format: 'uuid',
  })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  @IsOptional()
  opportunityId?: string | null;

  @ApiPropertyOptional({
    description: 'ID del cliente asociado (opcional)',
    format: 'uuid',
  })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  @IsOptional()
  clientId?: string | null;

  @ApiPropertyOptional({
    description: 'ID de la empresa asociada (opcional)',
    format: 'uuid',
  })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  @IsOptional()
  companyId?: string | null;

  @ApiPropertyOptional({
    description: 'IDs de contactos asociados (opcional)',
    type: [String],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  contactIds?: string[];

  @ApiPropertyOptional({ description: 'Indicador de historial (opcional)' })
  @IsBoolean()
  @IsOptional()
  flaghistory?: boolean;

  @ApiPropertyOptional({ description: 'Recordatorio opcional para la actividad' })
  @ValidateNested()
  @Type(() => ActivityReminderDto)
  @IsOptional()
  reminder?: ActivityReminderDto;

  @ApiPropertyOptional({ description: 'ID de evento externo', maxLength: 255 })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsOptional()
  externalEventId?: string;

  @ApiPropertyOptional({ description: 'Proveedor del calendario externo', enum: ['google', 'outlook'] })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MaxLength(50)
  @IsIn(['google', 'outlook'])
  @IsOptional()
  externalProvider?: string;

  @ApiPropertyOptional({ description: 'Fecha de la última sincronización externa' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  @IsOptional()
  externalLastSyncedAt?: string;
}


  