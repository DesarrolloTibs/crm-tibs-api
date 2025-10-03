import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ArchiveOpportunityDto {
  @IsBoolean()
  @IsNotEmpty()
  archived: boolean;
}