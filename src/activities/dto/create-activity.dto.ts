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
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ActivityReminderDto } from './activity-reminder.dto';


export class CreateActivityDto {
  @ApiProperty({ description: 'Fecha de la actividad' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ description: 'Descripción de la actividad' })
  @IsString()
  @IsNotEmpty()
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

  @ApiPropertyOptional({
    description: 'ID de la empresa asociada (opcional)',
    format: 'uuid',
  })
  @ValidateIf((object, value) => value !== null && value !== '')
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
}


  