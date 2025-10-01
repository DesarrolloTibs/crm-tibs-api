import { IsString, IsNotEmpty, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReminderDto {
  @ApiProperty({ description: 'Título del recordatorio' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Fecha del recordatorio', type: String, format: 'date-time' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ description: 'ID de la oportunidad relacionada', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  opportunity_id: string;
}