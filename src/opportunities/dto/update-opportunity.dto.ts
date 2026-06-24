import { IsString, IsUUID, IsNumber, Min, IsOptional, IsDateString, IsArray, IsEnum, IsInt, Max } from 'class-validator';
import { Currency } from '../entities/opportunity.entity';

export class UpdateOpportunityDto {
  @IsString()
  @IsOptional()
  nombre_proyecto?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  cliente_id?: string;

  @IsString()
  @IsOptional()
  empresa?: string;

  @IsUUID()
  @IsOptional()
  companyId?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  contactIds?: string[];

  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string;

  @IsUUID()
  @IsOptional()
  stage_id?: string;

  @IsUUID()
  @IsOptional()
  pipeline_id?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monto_licenciamiento?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monto_servicios?: number;

  @IsEnum(Currency)
  @IsOptional()
  moneda?: Currency;

  @IsUUID()
  @IsOptional()
  linea_negocio_id?: string;

  @IsUUID()
  @IsOptional()
  tipo_entrega_id?: string;

   
    @IsNumber()
    @Min(0)
    @IsOptional()
    monto_total?: number;

  @IsUUID()
  @IsOptional()
  licenciamiento_id?: string;

    @IsNumber()

    @Min(0)

    @IsOptional()

    tipoCambio?: number;

  

    

  

        @IsDateString()

  

        @IsOptional()

  

        estimated_closure_date?: Date;

        @IsDateString()
        @IsOptional()
        createdAt?: Date;

        @IsDateString()
        @IsOptional()
        stage_entered_at?: Date;

        @IsArray()
        @IsUUID(undefined, { each: true })
        @IsOptional()
        productIds?: string[];

        @IsInt()
        @Min(0)
        @Max(3)
        @IsOptional()
        priority?: number;
}
  