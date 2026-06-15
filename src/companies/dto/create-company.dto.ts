import { IsString, IsEmail, IsNotEmpty, IsOptional, IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ description: 'Nombre de la empresa' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ description: 'Correo electrónico de la empresa' })
  @IsEmail()
  @IsOptional()
  correo?: string;

  @ApiPropertyOptional({ description: 'Teléfono de la empresa' })
  @IsString()
  @IsOptional()
  telefono?: string;

  @ApiPropertyOptional({ description: 'Sitio web de la empresa' })
  @IsString()
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({ description: 'Dirección física de la empresa' })
  @IsString()
  @IsOptional()
  direccion?: string;

  @ApiPropertyOptional({ description: 'Estatus de la empresa', default: true })
  @IsBoolean()
  @IsOptional()
  estatus?: boolean;

  @ApiPropertyOptional({ description: 'ID del ejecutivo asignado' })
  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string;
}
