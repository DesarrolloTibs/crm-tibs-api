
import { IsUUID } from 'class-validator';

export class CreateOpportunityTrackingDto {
  @IsUUID()
  opportunity_id: string;

  @IsUUID()
  stage_id: string;

  @IsUUID()
  changed_by_id: string;
}

