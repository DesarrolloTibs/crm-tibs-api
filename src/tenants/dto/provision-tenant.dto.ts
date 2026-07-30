import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class ProvisionTenantDto {
  @ApiProperty({ example: 'Empresa Demo', description: 'Nombre de la organización o tenant' })
  @IsString()
  @IsNotEmpty()
  tenantName: string;

  @ApiProperty({ example: 'admin_demo', description: 'Nombre de usuario del administrador del tenant' })
  @IsString()
  @IsNotEmpty()
  adminUsername: string;

  @ApiProperty({ example: 'admin@demo.com', description: 'Correo del administrador del tenant' })
  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;

  @ApiProperty({ example: 1, description: 'ID del plan a asignar', required: false })
  @IsOptional()
  @IsNumber()
  planId?: number;

  @ApiProperty({ example: 1, description: 'Periodo de facturación en meses', required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  billingPeriodMonths?: number;
}
