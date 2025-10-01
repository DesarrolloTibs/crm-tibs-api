import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@demo.com', description: 'Correo electrónico del usuario' })
  email: string;

  @ApiProperty({ example: 'Admin2026!', description: 'Contraseña del usuario' })
  password: string;
}