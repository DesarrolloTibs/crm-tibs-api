import { Controller, Get, Post, Body, Patch, Param, ParseUUIDPipe, UsePipes, ValidationPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto, UpdateCompanyStatusDto } from './dto/update-company.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiCreatedResponse } from '@nestjs/swagger';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) { }

  @Post()
  @ApiOperation({ summary: 'Crear una nueva empresa' })
  @ApiCreatedResponse({ description: 'Empresa creada exitosamente.' })
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las empresas' })
  findAll() {
    return this.companiesService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Obtener todas las empresas activas' })
  findAllActive() {
    return this.companiesService.findAllActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una empresa por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una empresa' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar el estado de una empresa (Activo/Inactivo)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCompanyStatusDto: UpdateCompanyStatusDto,
  ) {
    return this.companiesService.updateStatus(id, updateCompanyStatusDto);
  }
}
