import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
    @ApiProperty({ description: 'Fecha del gasto (YYYY-MM-DD)', example: '2026-11-05' })
    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    @ApiProperty({ description: 'Concepto o descripción del gasto', maxLength: 255 })
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    concepto: string;

    @ApiProperty({ description: 'Monto numérico positivo del gasto', example: 1500.50, minimum: 0.01 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    @Max(9999999999999999.99)
    @IsNotEmpty()
    monto: number;

    @ApiPropertyOptional({ description: 'ID del cliente asociado (excluyente con opportunity_id)', nullable: true })
    @Transform(({ value }) => (value === '' ? null : value))
    @IsUUID()
    @IsOptional()
    client_id?: string | null;

    @ApiPropertyOptional({ description: 'ID de la oportunidad asociada (excluyente con client_id)', nullable: true })
    @Transform(({ value }) => (value === '' ? null : value))
    @IsUUID()
    @IsOptional()
    opportunity_id?: string | null;
}
