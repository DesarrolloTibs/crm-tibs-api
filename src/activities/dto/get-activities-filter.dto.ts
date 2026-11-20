import { IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetActivitiesFilterDto {
  @ApiPropertyOptional({ description: 'Filtrar por ID de usuario (solo Admins)', format: 'uuid' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ID de oportunidad', format: 'uuid' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  opportunityId?: string;
}
