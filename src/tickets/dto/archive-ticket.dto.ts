import { IsBoolean } from 'class-validator';

export class ArchiveTicketDto {
  @IsBoolean()
  archived: boolean;
}
