import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateExpenseDto {
    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    @IsString()
    @IsNotEmpty()
    concepto: string;

    @IsNumber()
    @IsNotEmpty()
    monto: number;

    @IsUUID()
    @IsOptional()
    client_id?: string;

    @IsUUID()
    @IsOptional()
    opportunity_id?: string;
}
