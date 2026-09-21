import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional } from 'class-validator';

export class UpdateTenantPlanDto {
  @ApiProperty({ example: 2, description: 'ID del nuevo plan a asignar' })
  @IsNumber()
  planId: number;

  @ApiProperty({
    example: 'immediate',
    enum: ['immediate', 'next_period'],
    description: 'Tipo de cambio: "immediate" aplica de inmediato; "next_period" programa el cambio para el próximo corte de facturación.',
    required: false,
    default: 'immediate',
  })
  @IsOptional()
  @IsIn(['immediate', 'next_period'])
  changeType?: 'immediate' | 'next_period';

  @ApiProperty({
    example: 'reset_date',
    enum: ['reset_date', 'keep_current_date'],
    description: 'Política de fecha para cambio inmediato: "reset_date" reinicia el ciclo desde hoy sumando meses; "keep_current_date" mantiene la fecha actual de corte.',
    required: false,
    default: 'reset_date',
  })
  @IsOptional()
  @IsIn(['reset_date', 'keep_current_date'])
  immediatePolicy?: 'reset_date' | 'keep_current_date';

  @ApiProperty({ example: 1, description: 'Número de meses de vigencia del período (por defecto usa billing_period_months del plan)', required: false })
  @IsOptional()
  @IsNumber()
  months?: number;

  @ApiProperty({
    example: false,
    description: 'Si es true, actualiza los períodos actualmente pendientes en cola al nuevo plan.',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  updateQueuedPlans?: boolean;

  @ApiProperty({ example: false, description: 'Permitir consumo de tokens extra fuera de cuota', required: false })
  @IsOptional()
  @IsBoolean()
  allowExtra?: boolean;
}
