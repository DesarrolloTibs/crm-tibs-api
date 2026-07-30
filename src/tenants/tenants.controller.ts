import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';

import { TenantsService } from './tenants.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';

@Controller('tenants')

export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('provision')
  async provision(@Body() dto: ProvisionTenantDto) {
    return this.tenantsService.provision(dto);
  }

  @SkipThrottle()
  @Get('consumption')
  async getConsumption(@Query('schemaName') schemaName?: string) {
    return this.tenantsService.getConsumption(schemaName);
  }

  @Get('my-tenant')
  async getMyTenant(@Query('schemaName') schemaName?: string) {
    return this.tenantsService.getCurrentTenant(schemaName);
  }

  @Get()
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new Error('Archivo de imagen no proporcionado');
    }
    const logoUrl = `/${file.path.replace(/\\/g, '/')}`;
    return this.tenantsService.updateLogo(id, logoUrl);
  }


  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.findOne(id);
  }

  @Put(':id/plan')
  async updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { planId: number; months?: number; allowExtra?: boolean }
  ) {
    return this.tenantsService.updatePlan(id, body.planId, body.months, body.allowExtra);
  }

  @Post(':id/enqueue-renewal')
  async enqueueRenewal(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { planId: number; months?: number }
  ) {
    return this.tenantsService.enqueueRenewal(id, body.planId, body.months);
  }

  @Put(':id/allow-extra')
  async updateAllowExtra(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { allowExtra: boolean }
  ) {
    return this.tenantsService.updateAllowExtra(id, body.allowExtra);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; is_active?: boolean; allow_extra?: boolean }
  ) {
    return this.tenantsService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.remove(id);
  }
}

