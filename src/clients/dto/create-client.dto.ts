import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsBoolean,
  ValidateIf,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ClientCategory } from '../entities/client.entity';

export class CreateClientDto {
  @ApiProperty({ description: 'Nombre del cliente', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre: string;

  @ApiPropertyOptional({ description: 'Apellido del cliente', maxLength: 255, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @MaxLength(255)
  @IsOptional()
  apellido?: string | null;

  @ApiPropertyOptional({ description: 'Correo electrónico del cliente', maxLength: 255, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsEmail()
  @MaxLength(255)
  @IsOptional()
  correo?: string | null;

  @ApiPropertyOptional({ description: 'Empresa del cliente', maxLength: 255, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @MaxLength(255)
  @IsOptional()
  empresa?: string | null;

  @ApiPropertyOptional({ description: 'ID de la empresa asociada', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsUUID()
  @IsOptional()
  companyId?: string | null;

  @ApiPropertyOptional({ description: 'Puesto del cliente', maxLength: 255, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @MaxLength(255)
  @IsOptional()
  puesto?: string | null;

  @ApiPropertyOptional({ description: 'Teléfono del cliente', maxLength: 50, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @MaxLength(50)
  @Matches(/^[0-9+\-()\s.*#,extEXT]{5,50}$/, {
    message: 'El teléfono debe tener entre 5 y 50 caracteres válidos (dígitos, +, -, paréntesis, espacios).',
  })
  @IsOptional()
  telefono?: string | null;

  @ApiPropertyOptional({ description: 'Estatus del cliente', default: true })
  @IsBoolean()
  @IsOptional()
  estatus?: boolean;

  @ApiPropertyOptional({ description: 'ID del ejecutivo asignado', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string | null;

  @ApiPropertyOptional({
    description: 'Categoría del cliente',
    enum: ClientCategory,
    default: ClientCategory.CONTACTO,
  })
  @IsEnum(ClientCategory)
  @IsOptional()
  category?: ClientCategory;
}
