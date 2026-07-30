import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto, UpdateClientStatusDto } from './dto/update-client.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiCreatedResponse } from '@nestjs/swagger';


@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
@UseGuards(AuthGuard('jwt'))
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) { }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo cliente' })
  @ApiCreatedResponse({ description: 'Cliente creado exitosamente.' })
  create(@Body() createClientDto: CreateClientDto) {
    return this.clientsService.create(createClientDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los clientes' })
  findAll() {
    return this.clientsService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Obtener todos los clientes activos' })
  findAllActive() {
    return this.clientsService.findAllActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un cliente por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un cliente' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClientDto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, updateClientDto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar el estado de un cliente (Activo/Inactivo)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClientStatusDto: UpdateClientStatusDto,
  ) {
    return this.clientsService.updateStatus(id, updateClientStatusDto);
  }
}