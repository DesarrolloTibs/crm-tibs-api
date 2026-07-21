import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConversationMessageDto {
  @ApiProperty()
  @IsString()
  role: string; // 'user' | 'assistant'

  @ApiProperty()
  @IsString()
  content: string;
}

export class WebchatQueryDto {
  @ApiProperty({ description: 'La pregunta del usuario en lenguaje natural' })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiPropertyOptional({ description: 'Historial de mensajes previos de la conversación', type: [ConversationMessageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  conversationHistory?: ConversationMessageDto[];
}
