import { IsString, IsNotEmpty, IsBoolean, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatalogOptionDto {
  @ApiProperty({ description: 'Nombre de la opción' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  strname: string;
}

export class UpdateCatalogOptionDto {
  @ApiProperty({ description: 'Nombre de la opción', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  strname?: string;

  @ApiProperty({ description: 'Estado activo/inactivo de la opción', required: false })
  @IsBoolean()
  @IsOptional()
  blnstatus?: boolean;
}
