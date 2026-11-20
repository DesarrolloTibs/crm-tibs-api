import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetCalendarAuthUrlQueryDto {
  @ApiProperty({ description: 'Proveedor de calendario externo', enum: ['google', 'outlook'] })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsNotEmpty({ message: 'El parámetro provider es obligatorio.' })
  @IsIn(['google', 'outlook'], { message: 'Proveedor inválido o no especificado (google o outlook).' })
  provider: 'google' | 'outlook';
}
