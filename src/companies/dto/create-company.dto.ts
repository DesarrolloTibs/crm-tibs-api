import { IsString, IsEmail, IsNotEmpty, IsOptional, IsUUID, IsBoolean, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateCompanyDto {
  @ApiProperty({ description: 'Nombre de la empresa' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ description: 'Correo electrónico de la empresa' })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => !!value)
  @IsEmail()
  @IsOptional()
  correo?: string | null;

  @ApiPropertyOptional({ description: 'Teléfono de la empresa' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @IsOptional()
  telefono?: string | null;

  @ApiPropertyOptional({ description: 'Sitio web de la empresa' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @IsOptional()
  website?: string | null;

  @ApiPropertyOptional({ description: 'Dirección física de la empresa' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @IsOptional()
  direccion?: string | null;

  @ApiPropertyOptional({ description: 'Estatus de la empresa', default: true })
  @IsBoolean()
  @IsOptional()
  estatus?: boolean;

  @ApiPropertyOptional({ description: 'ID del ejecutivo asignado' })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => !!value)
  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string | null;
}
