import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateQueueItemDto {
  @ApiProperty({ example: 2, description: 'Nuevo ID de plan para este período en cola', required: false })
  @IsOptional()
  @IsNumber()
  planId?: number;

  @ApiProperty({ example: 1, description: 'Meses de vigencia para este período en cola', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  billing_period_months?: number;
}
