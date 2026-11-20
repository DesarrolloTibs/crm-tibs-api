import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@demo.com', description: 'Correo electrónico del usuario' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido.' })
  @MaxLength(255, { message: 'El correo electrónico no debe exceder 255 caracteres.' })
  email: string;

  // Sin @MinLength(8) en login para mantener compatibilidad con contraseñas legacy cortas
  @ApiProperty({ example: 'Admin2026!', description: 'Contraseña del usuario' })
  @IsString({ message: 'La contraseña debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'La contraseña es requerida.' })
  @MaxLength(128, { message: 'La contraseña no debe exceder 128 caracteres.' })
  password: string;
}