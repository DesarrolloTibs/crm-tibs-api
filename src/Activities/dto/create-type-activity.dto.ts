import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateTypeActivityDto {
  @ApiProperty({ description: 'Nombre del tipo de actividad' })
  @IsString()
  @IsNotEmpty()
  strname: string;

  @ApiProperty({ description: 'Estado activo/inactivo', default: true })
  @IsBoolean()
  @IsOptional()
  blnstatus?: boolean;
}
