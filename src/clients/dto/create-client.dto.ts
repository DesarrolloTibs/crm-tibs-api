import { IsString, IsEmail, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsBoolean, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ClientCategory } from '../entities/client.entity';

export class CreateClientDto {
  @ApiProperty({ description: 'Nombre del cliente' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ description: 'Apellido del cliente' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @IsOptional()
  apellido?: string | null;

  @ApiPropertyOptional({ description: 'Correo electrónico del cliente' })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => !!value)
  @IsEmail()
  @IsOptional()
  correo?: string | null;

  @ApiPropertyOptional({ description: 'Empresa del cliente' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @IsOptional()
  empresa?: string | null;

  @ApiPropertyOptional({ description: 'ID de la empresa asociada' })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => !!value)
  @IsUUID()
  @IsOptional()
  companyId?: string | null;

  @ApiPropertyOptional({ description: 'Puesto del cliente' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @IsOptional()
  puesto?: string | null;

  @ApiPropertyOptional({ description: 'Teléfono del cliente' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @IsOptional()
  telefono?: string | null;

  @ApiPropertyOptional({ description: 'Estatus del cliente', default: true })
  @IsBoolean()
  @IsOptional()
  estatus?: boolean;

  @ApiPropertyOptional({ description: 'ID del ejecutivo asignado' })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => !!value)
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
