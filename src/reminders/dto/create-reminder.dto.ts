import { IsString, IsNotEmpty, IsUUID, IsDateString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReminderDto {
  @ApiProperty({ description: 'Título del recordatorio', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: 'Fecha del recordatorio', type: String, format: 'date-time' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiPropertyOptional({ description: 'ID de la actividad relacionada', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  activityId?: string | null;
}