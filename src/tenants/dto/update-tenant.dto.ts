import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Empresa Demo S.A.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la organización no puede estar vacío.' })
  @MinLength(2, { message: 'El nombre de la organización debe tener al menos 2 caracteres.' })
  @MaxLength(255, { message: 'El nombre de la organización no debe exceder 255 caracteres.' })
  name?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  allow_extra?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Solo modificable por SuperAdmin: habilita o deshabilita IBM Speech-to-Text.',
  })
  @IsOptional()
  @IsBoolean()
  ibm_audio_enabled?: boolean;
}
