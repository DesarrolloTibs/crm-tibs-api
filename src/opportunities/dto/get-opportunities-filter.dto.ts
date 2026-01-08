import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
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
}
