import { IsString, IsUUID, IsNumber, Min, IsOptional, IsDateString, IsArray, IsEnum } from 'class-validator';
import { Currency, BusinessLine, DeliveryType, Licensing } from '../entities/opportunity.entity';

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

  

      }

  

    

  