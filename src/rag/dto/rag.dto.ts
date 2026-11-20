import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UploadRagDto {
  @ApiProperty({ description: 'Identificador clave del producto asociado al documento PDF' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El identificador del producto (productKey) es obligatorio.' })
  @MaxLength(150, { message: 'El productKey no debe exceder 150 caracteres.' })
  productKey: string;
}

export class SearchRagQueryDto {
  @ApiProperty({ description: 'Consulta de búsqueda semántica' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El parámetro query es obligatorio.' })
  @MaxLength(500, { message: 'La consulta no debe exceder 500 caracteres.' })
  query: string;

  @ApiPropertyOptional({ description: 'Número máximo de resultados', minimum: 1, maximum: 20, default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un número entero.' })
  @Min(1, { message: 'limit debe ser al menos 1.' })
  @Max(20, { message: 'limit no puede exceder 20.' })
  limit?: number;

  @ApiPropertyOptional({ description: 'Filtrar resultados por clave de producto' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(150, { message: 'productKey no debe exceder 150 caracteres.' })
  productKey?: string;
}
