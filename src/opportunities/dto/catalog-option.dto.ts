import { IsString, IsNotEmpty, IsBoolean, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatalogOptionDto {
  @ApiProperty({ description: 'Nombre de la opción', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  strname: string;
}

export class UpdateCatalogOptionDto {
  @ApiProperty({ description: 'Nombre de la opción', maxLength: 255, required: false })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(255)
  strname?: string;

  @ApiProperty({ description: 'Estado activo/inactivo de la opción', required: false })
  @IsBoolean()
  @IsOptional()
  blnstatus?: boolean;
}
