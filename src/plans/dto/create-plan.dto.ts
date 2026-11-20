import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'Plan Pro', description: 'Nombre del plan' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El nombre del plan es obligatorio.' })
  @MaxLength(100, { message: 'El nombre del plan no debe exceder 100 caracteres.' })
  plan_name: string;

  @ApiProperty({ example: 49.99, description: 'Precio del plan' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio debe ser un número válido con máximo 2 decimales.' })
  @Min(0, { message: 'El precio no puede ser negativo.' })
  @Max(99999999.99, { message: 'El precio excede el límite máximo permitido.' })
  price: number;

  @ApiProperty({ example: 100000, description: 'Límite de tokens para el plan' })
  @IsInt({ message: 'tokens_limit debe ser un número entero.' })
  @Min(0, { message: 'tokens_limit no puede ser negativo.' })
  @Max(9000000000000000, { message: 'tokens_limit excede el límite permitido.' })
  tokens_limit: number;

  @ApiProperty({ example: 1, description: 'Periodo de cobro en meses', required: false, default: 1 })
  @IsOptional()
  @IsInt({ message: 'billing_period_months debe ser un número entero.' })
  @Min(1, { message: 'billing_period_months debe ser al menos 1.' })
  @Max(60, { message: 'billing_period_months no debe exceder 60 meses.' })
  billing_period_months?: number;

  @ApiProperty({ example: true, description: 'Estatus del plan', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  blnstatus?: boolean;
}
