import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInteractionDto {
  @ApiProperty({ description: 'Comentario de la interacción' })
  @IsString()
  @IsNotEmpty()
  comment: string;

  @ApiProperty({ description: 'ID de la oportunidad relacionada', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  opportunity_id: string;
}