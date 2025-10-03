import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty({
    example: true,
    description: 'Define si el usuario está activo o no',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}


export class UpdateUserStatusDto {
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}