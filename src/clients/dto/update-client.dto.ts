import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateClientDto } from './create-client.dto';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class UpdateClientStatusDto {
  @ApiProperty({ description: 'Estatus del cliente' })
  @IsBoolean()
  @IsNotEmpty()
  estatus: boolean;
}
