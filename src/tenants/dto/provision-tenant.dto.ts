import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ProvisionTenantDto {
  @ApiProperty({ example: 'Empresa Demo', description: 'Nombre de la organización o tenant' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la organización es obligatorio.' })
  @MinLength(2, { message: 'El nombre de la organización debe tener al menos 2 caracteres.' })
  @MaxLength(255, { message: 'El nombre de la organización no debe exceder 255 caracteres.' })
  tenantName: string;

  @ApiProperty({ example: 'admin_demo', description: 'Nombre de usuario del administrador del tenant' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El nombre de usuario administrador es obligatorio.' })
  @MinLength(2, { message: 'El nombre de usuario administrador debe tener al menos 2 caracteres.' })
  @MaxLength(100, { message: 'El nombre de usuario administrador no debe exceder 100 caracteres.' })
  @Matches(/^[a-zA-Z0-9_.\s-]+$/, {
    message: 'El nombre de usuario administrador contiene caracteres no permitidos.',
  })
  adminUsername: string;

  @ApiProperty({ example: 'admin@demo.com', description: 'Correo del administrador del tenant' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El correo del administrador no es válido.' })
  @IsNotEmpty({ message: 'El correo del administrador es obligatorio.' })
  @MaxLength(255, { message: 'El correo del administrador no debe exceder 255 caracteres.' })
  adminEmail: string;

  @ApiProperty({ example: 1, description: 'ID del plan a asignar', required: false })
  @IsOptional()
  @IsInt({ message: 'planId debe ser un entero positivo.' })
  @IsPositive({ message: 'planId debe ser mayor a 0.' })
  planId?: number;

  @ApiProperty({ example: 1, description: 'Periodo de facturación en meses', required: false, default: 1 })
  @IsOptional()
  @IsInt({ message: 'billingPeriodMonths debe ser un número entero.' })
  @Min(1, { message: 'billingPeriodMonths debe ser al menos 1.' })
  @Max(60, { message: 'billingPeriodMonths no debe exceder 60 meses.' })
  billingPeriodMonths?: number;
}
