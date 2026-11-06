import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateCompanyDto } from './create-company.dto';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {}

export class UpdateCompanyStatusDto {
  @ApiProperty({ description: 'Estatus de la empresa' })
  @IsBoolean()
  @IsNotEmpty()
  estatus: boolean;
}
