import { IsOptional, IsEnum, IsBoolean, IsDateString } from 'class-validator';
import { OpportunityStage } from '../entities/opportunity.entity';
import { Transform } from 'class-transformer';

export class GetOpportunitiesFilterDto {
  @IsOptional()
  @IsEnum(OpportunityStage)
  etapa?: OpportunityStage;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  showArchived?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
