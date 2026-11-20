import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetTicketsFilterDto {
  @ApiPropertyOptional({ description: 'Filtrar por ID de etapa', format: 'uuid' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  stage_id?: string;

  @ApiPropertyOptional({ description: 'Mostrar tickets archivados', type: Boolean })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  showArchived?: boolean;
}

export class PublicTicketQueryDto {
  @ApiPropertyOptional({ description: 'Correo electrónico del contacto' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Número de ticket (e.g. 12 o #00012)' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^#?\d{1,10}$/, {
    message: 'El número de ticket debe contener únicamente dígitos (opcionalmente precedidos por #).',
  })
  ticketNumber?: string;
}
