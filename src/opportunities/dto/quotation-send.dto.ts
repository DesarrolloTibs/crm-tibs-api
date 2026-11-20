import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendQuotationPdfDto {
  @ApiProperty({ description: 'ID de la conversación donde enviar la cotización', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  conversationId: string;
}

export class UploadOpportunityFileDto {
  @ApiPropertyOptional({ description: 'Título descriptivo del archivo', maxLength: 255 })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Fecha asociada al documento (ISO 8601)' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  date?: string;
}
