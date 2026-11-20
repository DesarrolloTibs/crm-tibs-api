import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'johndoe', description: 'Nombre de usuario único' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El nombre de usuario es obligatorio.' })
  @MinLength(2, { message: 'El nombre de usuario debe tener al menos 2 caracteres.' })
  @MaxLength(100, { message: 'El nombre de usuario no debe exceder 100 caracteres.' })
  username: string;

  @ApiProperty({ example: 'Password123', description: 'Contraseña del usuario (mínimo 8 caracteres con letras y números)' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no debe exceder 72 caracteres.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'La contraseña debe incluir al menos una letra y un número.',
  })
  password: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'Email del usuario' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio.' })
  @MaxLength(255, { message: 'El correo electrónico no debe exceder 255 caracteres.' })
  email: string;

  @ApiPropertyOptional({ example: Role.Admin, enum: Role, description: 'Rol del usuario' })
  @IsEnum(Role, { message: 'El rol especificado no es válido.' })
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ example: true, description: 'Define si el usuario está activo o no' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '/uploads/profiles/user.png', description: 'URL de la imagen de perfil del usuario' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La URL de imagen de perfil no debe exceder 500 caracteres.' })
  profileImageUrl?: string | null;
}

