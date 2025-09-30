import { IsString, IsNotEmpty, IsUUID, IsEnum, IsNumber, Min, IsOptional } from 'class-validator';
import { OpportunityStage, Currency, BusinessLine, DeliveryType, Licensing } from '../entities/opportunity.entity';

export class CreateOpportunityDto {
  @IsString()
  @IsNotEmpty()
  nombre_proyecto: string;

  @IsUUID()
  @IsNotEmpty()
  cliente_id: string;

  @IsString()
  @IsNotEmpty()
  empresa: string;

  @IsUUID()
  @IsOptional() // Assuming it can be assigned later
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
  @IsNotEmpty()
  moneda: Currency;

  @IsEnum(BusinessLine)
  @IsNotEmpty()
  linea_negocio: BusinessLine;

  @IsEnum(DeliveryType)
  @IsNotEmpty()
  tipo_entrega: DeliveryType;

  @IsEnum(Licensing)
  @IsOptional()
  licenciamiento?: Licensing;
}
