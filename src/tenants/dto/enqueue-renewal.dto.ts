import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class EnqueueRenewalDto {
  @ApiProperty({ example: 1, description: 'ID del plan para la renovación (si se omite, toma el plan actual de la organización)', required: false })
  @IsOptional()
  @IsNumber()
  planId?: number;

  @ApiProperty({ example: 1, description: 'Meses por período (si se omite, toma billing_period_months del plan)', required: false })
  @IsOptional()
  @IsNumber()
  months?: number;

  @ApiProperty({
    example: 1,
    description: 'Cantidad de períodos a encolar secuencialmente (ej. 3 para 3 meses/bimestres)',
    required: false,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  periodsCount?: number;
}
