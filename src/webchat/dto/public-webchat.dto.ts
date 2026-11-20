import { IsNotEmpty, IsOptional, IsString, IsUUID, IsEmail, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendPublicWebchatMessageDto {
  @ApiProperty({
    description: 'UUID público del canal Webchat (tenantKey / channelConfigId) perteneciente al tenant',
    example: 'd9b2d63d-a51f-4c8d-8a56-8a71dcb6e87f',
  })
  @IsUUID('4', { message: 'El tenantKey debe ser un UUID válido.' })
  @IsNotEmpty({ message: 'El tenantKey es obligatorio.' })
  tenantKey: string;

  @ApiProperty({
    description: 'Identificador único persistente del visitante en su navegador (almacenado en localStorage)',
    example: 'vis_8a71dcb6-e87f-4c8d-9b2d-63da51f4c8d8',
    maxLength: 150,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El visitorId es obligatorio.' })
  @MaxLength(150, { message: 'El visitorId no debe exceder 150 caracteres.' })
  visitorId: string;

  @ApiProperty({
    description: 'Texto del mensaje enviado por el visitante',
    example: 'Hola, me interesa conocer los planes de suscripción y precios.',
    maxLength: 4000,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El texto del mensaje no puede estar vacío.' })
  @MaxLength(4000, { message: 'El texto del mensaje no debe exceder 4000 caracteres.' })
  text: string;

  @ApiPropertyOptional({
    description: 'Nombre o apodo del visitante',
    example: 'Carlos Mendoza',
    maxLength: 120,
  })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'El nombre o apodo no debe exceder 120 caracteres.' })
  nickname?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico del visitante para captura de contacto',
    example: 'carlos@empresa.com',
    maxLength: 255,
  })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsOptional()
  @IsEmail({}, { message: 'El formato del correo electrónico no es válido.' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Número de teléfono o móvil del visitante',
    example: '+525512345678',
    maxLength: 50,
  })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'El teléfono no debe exceder 50 caracteres.' })
  phone?: string;
}

export class GetPublicWebchatQueryDto {
  @ApiPropertyOptional({
    description: 'Identificador público del canal Webchat (UUID, verifyToken o schema_name)',
    example: 'd9b2d63d-a51f-4c8d-8a56-8a71dcb6e87f',
    maxLength: 150,
  })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'tenantKey no debe exceder 150 caracteres.' })
  tenantKey?: string;
}
