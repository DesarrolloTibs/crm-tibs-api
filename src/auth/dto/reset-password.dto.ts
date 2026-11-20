import { IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token de restablecimiento recibido por correo' })
  @IsString()
  @IsNotEmpty({ message: 'El token es requerido' })
  @MaxLength(255, { message: 'El token no es válido' })
  token: string;

  @ApiProperty({ example: 'Password123', description: 'Nueva contraseña del usuario (mínimo 8 caracteres con letras y números)' })
  @IsString()
  @IsNotEmpty({ message: 'La nueva contraseña es requerida' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no debe exceder 72 caracteres' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'La contraseña debe contener al menos una letra y un número',
  })
  password: string;
}
