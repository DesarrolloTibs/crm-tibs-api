import { IsString, IsEmail, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  apellido: string;

  @IsEmail()
  @IsNotEmpty()
  correo: string;

  @IsString()
  @IsNotEmpty()
  empresa: string;

  @IsString()
  @IsOptional()
  puesto?: string;

  @IsString()
  @IsOptional()
  telefono?: string;
}
