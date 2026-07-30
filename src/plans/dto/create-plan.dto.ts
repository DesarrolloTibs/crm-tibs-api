import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'Plan Pro', description: 'Nombre del plan' })
  @IsString()
  @IsNotEmpty()
  plan_name: string;

  @ApiProperty({ example: 49.99, description: 'Precio del plan' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 100000, description: 'Límite de tokens para el plan' })
  @IsNumber()
  @Min(0)
  tokens_limit: number;

  @ApiProperty({ example: 1, description: 'Periodo de cobro en meses', required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  billing_period_months?: number;

  @ApiProperty({ example: true, description: 'Estatus del plan', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  blnstatus?: boolean;
}
