import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Token de actualización JWT emitido previamente al iniciar sesión o refrescar',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsNotEmpty({ message: 'El refresh_token es obligatorio' })
  @IsString({ message: 'El refresh_token debe ser una cadena de texto' })
  refresh_token: string;
}
