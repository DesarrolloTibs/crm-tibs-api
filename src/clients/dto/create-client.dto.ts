import { IsString, IsEmail, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsBoolean, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ClientCategory } from '../entities/client.entity';

export class CreateClientDto {
  @ApiProperty({ description: 'Nombre del cliente' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ description: 'Apellido del cliente', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @IsOptional()
  apellido?: string | null;

  @ApiPropertyOptional({ description: 'Correo electrónico del cliente', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsEmail()
  @IsOptional()
  correo?: string | null;

  @ApiPropertyOptional({ description: 'Empresa del cliente', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @IsOptional()
  empresa?: string | null;

  @ApiPropertyOptional({ description: 'ID de la empresa asociada', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsUUID()
  @IsOptional()
  companyId?: string | null;

  @ApiPropertyOptional({ description: 'Puesto del cliente', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @IsOptional()
  puesto?: string | null;

  @ApiPropertyOptional({ description: 'Teléfono del cliente', nullable: true })
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
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
