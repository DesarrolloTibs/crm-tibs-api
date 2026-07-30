import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty({
    example: true,
    description: 'Define si el usuario está activo o no',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    example: '/uploads/profiles/user.png',
    description: 'URL de la imagen de perfil del usuario',
    required: false,
  })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}


export class UpdateUserStatusDto {
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}