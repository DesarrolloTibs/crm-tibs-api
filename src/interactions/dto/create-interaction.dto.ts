import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateInteractionDto {
  @IsString()
  @IsNotEmpty()
  comment: string;

  @IsUUID()
  @IsNotEmpty()
  opportunity_id: string;
}