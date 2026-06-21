import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOpportunityLabelDto {
  @ApiProperty({ description: 'Nombre de la etiqueta' })
  @IsString()
  @IsNotEmpty()
  strname: string;
}
