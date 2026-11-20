import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsBoolean,
  ValidateIf,
  MaxLength,
  IsUrl,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateCompanyDto {
  @ApiProperty({ description: 'Nombre de la empresa', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre: string;

  @ApiPropertyOptional({ description: 'Correo electrónico de la empresa', maxLength: 255 })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @ValidateIf((_, value) => !!value)
  @IsEmail()
  @MaxLength(255)
  @IsOptional()
  correo?: string | null;

  @ApiPropertyOptional({ description: 'Teléfono de la empresa', maxLength: 50 })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => !!value)
  @IsString()
  @MaxLength(50)
  @Matches(/^[0-9+\-()\s.*#,extEXT]{5,50}$/, {
    message: 'El teléfono debe tener entre 5 y 50 caracteres válidos (dígitos, +, -, paréntesis, espacios).',
  })
  @IsOptional()
  telefono?: string | null;

  @ApiPropertyOptional({ description: 'Sitio web de la empresa (http/https)', maxLength: 255 })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => !!value)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'El sitio web debe ser una URL válida con protocolo http:// o https://' },
  )
  @MaxLength(255)
  @IsOptional()
  website?: string | null;

  @ApiPropertyOptional({ description: 'Dirección física de la empresa', maxLength: 512 })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => !!value)
  @IsString()
  @MaxLength(512)
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
