import { IsString, IsNotEmpty, IsUUID, IsEnum, IsNumber, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OpportunityStage, Currency, BusinessLine, DeliveryType, Licensing } from '../entities/opportunity.entity';

export class CreateOpportunityDto {
  @ApiProperty({ description: 'Nombre del proyecto' })
  @IsString()
  @IsNotEmpty()
  nombre_proyecto: string;

  @ApiProperty({ description: 'ID del cliente', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  cliente_id: string;

  @ApiProperty({ description: 'Empresa asociada al proyecto' })
  @IsString()
  @IsNotEmpty()
  empresa: string;

  @ApiPropertyOptional({ description: 'ID del ejecutivo asignado', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  ejecutivo_id?: string;

  @ApiPropertyOptional({ description: 'Etapa de la oportunidad', enum: OpportunityStage })
  @IsEnum(OpportunityStage)
  @IsOptional()
  etapa?: OpportunityStage;

  @ApiPropertyOptional({ description: 'Monto de licenciamiento', minimum: 0, type: Number })
  @IsNumber()
  @Min(0)
  @IsOptional()
  monto_licenciamiento?: number;

  @ApiPropertyOptional({ description: 'Monto de servicios', minimum: 0, type: Number })
  @IsNumber()
  @Min(0)
  @IsOptional()
  monto_servicios?: number;

  @ApiProperty({ description: 'Moneda', enum: Currency })
  @IsEnum(Currency)
  @IsNotEmpty()
  moneda: Currency;

  @ApiProperty({ description: 'Línea de negocio', enum: BusinessLine })
  @IsEnum(BusinessLine)
  @IsNotEmpty()
  linea_negocio: BusinessLine;

  @ApiProperty({ description: 'Tipo de entrega', enum: DeliveryType })
  @IsEnum(DeliveryType)
  @IsNotEmpty()
  tipo_entrega: DeliveryType;

  @ApiPropertyOptional({ description: 'Tipo de licenciamiento', enum: Licensing })
  @IsEnum(Licensing)
  @IsOptional()
  licenciamiento?: Licensing;
}
