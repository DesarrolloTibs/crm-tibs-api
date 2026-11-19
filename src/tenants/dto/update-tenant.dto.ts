import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Empresa Demo S.A.' })
  @IsOptional()
  @IsString()
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
