import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsInt, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ description: 'Nombre del producto' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ description: 'Descripción detallada del producto' })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Precio base del producto', minimum: 0, default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  precioBase?: number;

  @ApiPropertyOptional({ description: 'Estatus del producto (Activo/Inactivo)', default: true })
  @IsBoolean()
  @IsOptional()
  status?: boolean;

  @ApiPropertyOptional({ description: 'Imagen de portada del producto', nullable: true })
  @IsString()
  @IsOptional()
  imagenPortada?: string | null;

  @ApiPropertyOptional({ description: 'Indica si el producto requiere análisis o es a la medida', default: false })
  @IsBoolean()
  @IsOptional()
  requiere_analisis?: boolean;
}
