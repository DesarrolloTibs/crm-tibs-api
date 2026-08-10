import { IsOptional, IsBoolean, IsUUID, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetOpportunitiesFilterDto {
  @IsOptional()
  @IsUUID()
  stage_id?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  showArchived?: boolean;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}


