import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';

export class EnqueueRenewalDto {
  @ApiProperty({ example: 1, description: 'ID del plan para la renovación (si se omite, toma el plan actual de la organización)', required: false })
  @IsOptional()
  @IsInt({ message: 'planId debe ser un número entero.' })
  @IsPositive({ message: 'planId debe ser mayor a 0.' })
  planId?: number;

  @ApiProperty({ example: 1, description: 'Meses por período (si se omite, toma billing_period_months del plan)', required: false })
  @IsOptional()
  @IsInt({ message: 'months debe ser un número entero.' })
  @Min(1, { message: 'months debe ser al menos 1.' })
  @Max(60, { message: 'months no debe exceder 60 meses.' })
  months?: number;

  @ApiProperty({
    example: 1,
    description: 'Cantidad de períodos a encolar secuencialmente (ej. 3 para 3 meses/bimestres)',
    required: false,
    default: 1,
  })
  @IsOptional()
  @IsInt({ message: 'periodsCount debe ser un número entero.' })
  @Min(1, { message: 'periodsCount debe ser al menos 1.' })
  @Max(60, { message: 'periodsCount no debe exceder 60.' })
  periodsCount?: number;
}
