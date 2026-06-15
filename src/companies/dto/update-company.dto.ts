import { PartialType } from '@nestjs/swagger';
import { CreateCompanyDto } from './create-company.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {}

export class UpdateCompanyStatusDto {
  @ApiPropertyOptional({ description: 'Estatus de la empresa' })
  @IsBoolean()
  estatus: boolean;
}
