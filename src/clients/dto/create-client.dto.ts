import { IsString, IsEmail, IsNotEmpty, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientCategory } from '../entities/client.entity';

export class CreateClientDto {
  @ApiProperty({ description: 'Nombre del cliente' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ description: 'Apellido del cliente' })
  @IsString()
  @IsNotEmpty()
  apellido: string;

  @ApiProperty({ description: 'Correo electrónico del cliente' })
  @IsEmail()
  @IsNotEmpty()
  correo: string;

  @ApiProperty({ description: 'Empresa del cliente' })
  @IsString()
  @IsNotEmpty()
  empresa: string;

  @ApiPropertyOptional({ description: 'Puesto del cliente' })
  @IsString()
  @IsOptional()
  puesto?: string;

  @ApiPropertyOptional({ description: 'Teléfono del cliente' })
  @IsString()
  @IsOptional()
  telefono?: string;

  @ApiPropertyOptional({ description: 'Estatus del cliente', default: true })
  @IsOptional()
  estatus?: boolean;

  @ApiPropertyOptional({ description: 'ID del ejecutivo asignado' })
  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string;

  @ApiPropertyOptional({
    description: 'Categoría del cliente',
    enum: ClientCategory,
    default: ClientCategory.CONTACTO,
  })
  @IsEnum(ClientCategory)
  @IsOptional()
  category?: ClientCategory;
}
