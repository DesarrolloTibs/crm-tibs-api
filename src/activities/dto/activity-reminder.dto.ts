import { IsString, IsNotEmpty, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ActivityReminderDto {
  @ApiProperty({ description: 'Título corto del recordatorio', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: 'Fecha y hora del recordatorio', type: String, format: 'date-time' })
  @IsDateString()
  @IsNotEmpty()
  date: string;
}
