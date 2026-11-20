import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';

export class UpdateQueueItemDto {
  @ApiProperty({ example: 2, description: 'Nuevo ID de plan para este período en cola', required: false })
  @IsOptional()
  @IsInt({ message: 'planId debe ser un número entero.' })
  @IsPositive({ message: 'planId debe ser mayor a 0.' })
  planId?: number;

  @ApiProperty({ example: 1, description: 'Meses de vigencia para este período en cola', required: false })
  @IsOptional()
  @IsInt({ message: 'billing_period_months debe ser un número entero.' })
  @Min(1, { message: 'billing_period_months debe ser al menos 1.' })
  @Max(60, { message: 'billing_period_months no debe exceder 60 meses.' })
  billing_period_months?: number;
}
