import { IsString, IsUUID, IsEnum, IsNumber, Min, IsOptional } from 'class-validator';
import { OpportunityStage, Currency, BusinessLine, DeliveryType, Licensing } from '../entities/opportunity.entity';

export class UpdateOpportunityDto {
  @IsString()
  @IsOptional()
  nombre_proyecto?: string;

  @IsUUID()
  @IsOptional()
  cliente_id?: string;

  @IsString()
  @IsOptional()
  empresa?: string;

  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string;

  @IsEnum(OpportunityStage)
  @IsOptional()
  etapa?: OpportunityStage;

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

  @IsEnum(BusinessLine)
  @IsOptional()
  linea_negocio?: BusinessLine;

  @IsEnum(DeliveryType)
  @IsOptional()
  tipo_entrega?: DeliveryType;

   
    @IsNumber()
    @Min(0)
    @IsOptional()
    monto_total?: number;

  @IsEnum(Licensing)
  @IsOptional()
  licenciamiento?: Licensing;
}