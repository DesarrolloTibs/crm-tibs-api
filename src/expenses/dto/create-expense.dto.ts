import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
    @ApiProperty({ description: 'Fecha del gasto (YYYY-MM-DD)', example: '2026-11-05' })
    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    @ApiProperty({ description: 'Concepto o descripción del gasto' })
    @IsString()
    @IsNotEmpty()
    concepto: string;

    @ApiProperty({ description: 'Monto numérico del gasto', example: 1500.50 })
    @Type(() => Number)
    @IsNumber()
    @IsNotEmpty()
    monto: number;

    @ApiPropertyOptional({ description: 'ID del cliente asociado (excluyente con opportunity_id)', nullable: true })
    @Transform(({ value }) => (value === '' ? null : value))
    @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
    @IsUUID()
    @IsOptional()
    client_id?: string | null;

    @ApiPropertyOptional({ description: 'ID de la oportunidad asociada (excluyente con client_id)', nullable: true })
    @Transform(({ value }) => (value === '' ? null : value))
    @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
    @IsUUID()
    @IsOptional()
    opportunity_id?: string | null;
}
