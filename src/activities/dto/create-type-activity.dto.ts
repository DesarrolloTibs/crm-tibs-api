import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTypeActivityDto {
  @ApiProperty({ description: 'Nombre del tipo de actividad', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  strname: string;

  @ApiProperty({ description: 'Estado activo/inactivo', default: true })
  @IsBoolean()
  @IsOptional()
  blnstatus?: boolean;
}
