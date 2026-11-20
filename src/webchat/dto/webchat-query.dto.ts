import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsIn, MaxLength, ArrayMaxSize } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConversationMessageDto {
  @ApiProperty({ enum: ['user', 'assistant', 'system'] })
  @IsString()
  @IsIn(['user', 'assistant', 'system'], { message: 'El rol del mensaje debe ser user, assistant o system.' })
  role: string;

  @ApiProperty({ maxLength: 20000 })
  @IsString()
  @MaxLength(20000, { message: 'El contenido de un mensaje del historial no debe exceder 20,000 caracteres.' })
  content: string;
}

export class WebchatQueryDto {
  @ApiProperty({ description: 'La pregunta del usuario en lenguaje natural', maxLength: 4000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'La consulta no puede estar vacía.' })
  @MaxLength(4000, { message: 'La consulta no debe exceder 4000 caracteres.' })
  question: string;

  @ApiPropertyOptional({ description: 'Historial de mensajes previos de la conversación', type: [ConversationMessageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'El historial de conversación no debe exceder 100 mensajes.' })
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  conversationHistory?: ConversationMessageDto[];
}
