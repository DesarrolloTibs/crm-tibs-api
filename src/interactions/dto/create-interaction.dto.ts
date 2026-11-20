import { IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInteractionDto {
  @ApiProperty({ description: 'Comentario de la interacción', maxLength: 5000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  comment: string;

  @ApiProperty({ description: 'ID de la oportunidad relacionada', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  opportunity_id: string;
}