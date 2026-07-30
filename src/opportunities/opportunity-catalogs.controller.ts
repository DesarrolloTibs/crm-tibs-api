import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OpportunityCatalogsService } from './opportunity-catalogs.service';
import { CreateCatalogOptionDto, UpdateCatalogOptionDto } from './dto/catalog-option.dto';

@ApiTags('opportunity-catalogs')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard('jwt'))
export class OpportunityCatalogsController {
  constructor(private readonly catalogsService: OpportunityCatalogsService) {}

  // ==========================================
  // 1. Líneas de Negocio (Business Lines)
  // ==========================================
  @Get('business-lines')
  @ApiOperation({ summary: 'Obtener todas las opciones de línea de negocio' })
  async getBusinessLines() {
    return this.catalogsService.findAll('business-lines');
  }

  @Get('business-lines/active')
  @ApiOperation({ summary: 'Obtener opciones de línea de negocio activas' })
  async getActiveBusinessLines() {
    return this.catalogsService.findAllActive('business-lines');
  }

  @Post('business-lines')
  @ApiOperation({ summary: 'Crear opción de línea de negocio' })
  async createBusinessLine(@Body() createDto: CreateCatalogOptionDto) {
    return this.catalogsService.create('business-lines', createDto.strname);
  }

  @Patch('business-lines/:id')
  @ApiOperation({ summary: 'Actualizar opción de línea de negocio' })
  async updateBusinessLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateCatalogOptionDto,
  ) {
    return this.catalogsService.update('business-lines', id, updateDto.strname, updateDto.blnstatus);
  }

  @Delete('business-lines/:id')
  @ApiOperation({ summary: 'Eliminar opción de línea de negocio' })
  async deleteBusinessLine(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogsService.remove('business-lines', id);
  }

  // ==========================================
  // 2. Tipos de Entrega (Delivery Types)
  // ==========================================
  @Get('delivery-types')
  @ApiOperation({ summary: 'Obtener todas las opciones de tipo de entrega' })
  async getDeliveryTypes() {
    return this.catalogsService.findAll('delivery-types');
  }

  @Get('delivery-types/active')
  @ApiOperation({ summary: 'Obtener opciones de tipo de entrega activas' })
  async getActiveDeliveryTypes() {
    return this.catalogsService.findAllActive('delivery-types');
  }

  @Post('delivery-types')
  @ApiOperation({ summary: 'Crear opción de tipo de entrega' })
  async createDeliveryType(@Body() createDto: CreateCatalogOptionDto) {
    return this.catalogsService.create('delivery-types', createDto.strname);
  }

  @Patch('delivery-types/:id')
  @ApiOperation({ summary: 'Actualizar opción de tipo de entrega' })
  async updateDeliveryType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateCatalogOptionDto,
  ) {
    return this.catalogsService.update('delivery-types', id, updateDto.strname, updateDto.blnstatus);
  }

  @Delete('delivery-types/:id')
  @ApiOperation({ summary: 'Eliminar opción de tipo de entrega' })
  async deleteDeliveryType(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogsService.remove('delivery-types', id);
  }

  // ==========================================
  // 3. Licenciamientos (Licensings)
  // ==========================================
  @Get('licensings')
  @ApiOperation({ summary: 'Obtener todas las opciones de licenciamiento' })
  async getLicensings() {
    return this.catalogsService.findAll('licensings');
  }

  @Get('licensings/active')
  @ApiOperation({ summary: 'Obtener opciones de licenciamiento activas' })
  async getActiveLicensings() {
    return this.catalogsService.findAllActive('licensings');
  }

  @Post('licensings')
  @ApiOperation({ summary: 'Crear opción de licenciamiento' })
  async createLicensing(@Body() createDto: CreateCatalogOptionDto) {
    return this.catalogsService.create('licensings', createDto.strname);
  }

  @Patch('licensings/:id')
  @ApiOperation({ summary: 'Actualizar opción de licenciamiento' })
  async updateLicensing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateCatalogOptionDto,
  ) {
    return this.catalogsService.update('licensings', id, updateDto.strname, updateDto.blnstatus);
  }

  @Delete('licensings/:id')
  @ApiOperation({ summary: 'Eliminar opción de licenciamiento' })
  async deleteLicensing(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogsService.remove('licensings', id);
  }
}
