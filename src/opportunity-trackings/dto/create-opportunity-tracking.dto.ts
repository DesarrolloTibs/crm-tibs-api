
import { IsUUID, IsEnum } from 'class-validator';
import { OpportunityStage } from '../../opportunities/entities/opportunity.entity';

export class CreateOpportunityTrackingDto {
  @IsUUID()
  opportunity_id: string;

  @IsEnum(OpportunityStage)
  stage: OpportunityStage;

  @IsUUID()
  changed_by_id: string;
}
