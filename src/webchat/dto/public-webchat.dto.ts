import { IsNotEmpty, IsOptional, IsString, IsUUID, IsEmail } from 'class-validator';
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
  })
  @IsString()
  @IsNotEmpty({ message: 'El visitorId es obligatorio.' })
  visitorId: string;

  @ApiProperty({
    description: 'Texto del mensaje enviado por el visitante',
    example: 'Hola, me interesa conocer los planes de suscripción y precios.',
  })
  @IsString()
  @IsNotEmpty({ message: 'El texto del mensaje no puede estar vacío.' })
  text: string;

  @ApiPropertyOptional({
    description: 'Nombre o apodo del visitante',
    example: 'Carlos Mendoza',
  })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico del visitante para captura de contacto',
    example: 'carlos@empresa.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El formato del correo electrónico no es válido.' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Número de teléfono o móvil del visitante',
    example: '+525512345678',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class GetPublicWebchatQueryDto {
  @ApiProperty({
    description: 'UUID público del canal Webchat (tenantKey / channelConfigId) perteneciente al tenant',
    example: 'd9b2d63d-a51f-4c8d-8a56-8a71dcb6e87f',
  })
  @IsUUID('4', { message: 'El tenantKey debe ser un UUID válido.' })
  @IsNotEmpty({ message: 'El tenantKey es obligatorio.' })
  tenantKey: string;
}
