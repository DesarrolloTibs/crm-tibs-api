import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTicketInteractionDto {
  @ApiProperty({ description: 'Comentario del historial del ticket' })
  @IsString()
  @IsNotEmpty()
  comment: string;

  @ApiProperty({ description: 'ID del ticket relacionado', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  ticket_id: string;
}
