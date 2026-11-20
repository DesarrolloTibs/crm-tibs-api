import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, MaxLength, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ description: 'Nombre del producto', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre: string;

  @ApiPropertyOptional({ description: 'Descripción detallada del producto', maxLength: 5000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Precio base del producto', minimum: 0, maximum: 99999999.99, default: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  @IsOptional()
  precioBase?: number;

  @ApiPropertyOptional({ description: 'Estatus del producto (Activo/Inactivo)', default: true })
  @IsBoolean()
  @IsOptional()
  status?: boolean;

  @ApiPropertyOptional({ description: 'Imagen de portada del producto', maxLength: 512, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(512)
  @IsOptional()
  imagenPortada?: string | null;

  @ApiPropertyOptional({ description: 'Unidad de medida del producto (ej: Pieza, Servicio)', maxLength: 100, default: 'Pieza' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  @IsOptional()
  unidadMedida?: string;

  @ApiPropertyOptional({ description: 'Observaciones / Notas del producto', maxLength: 2000, nullable: true })
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  observaciones?: string | null;
}

export class UploadProductFileDto {
  @ApiPropertyOptional({ description: 'Título descriptivo del archivo adjunto', maxLength: 255 })
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsOptional()
  title?: string;
}
