import { PartialType } from '@nestjs/mapped-types';
import { CreateClientDto } from './create-client.dto';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateClientDto extends PartialType(CreateClientDto) {}



export class UpdateClientStatusDto {
  @IsBoolean()
  @IsNotEmpty()
  estatus: boolean;
}
