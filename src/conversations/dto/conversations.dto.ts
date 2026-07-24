import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class AssignUserDto {
  @IsString()
  @IsOptional()
  assignedUserId?: string | null;
}

export class ToggleBotStatusDto {
  @IsBoolean()
  botActive: boolean;
}

export class SendManualMessageDto {
  @IsString()
  content: string;
}
