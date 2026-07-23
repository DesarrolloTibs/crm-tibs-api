import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';

import { TenantsService } from './tenants.service';
import { ProvisionTenantDto } from '../tenancy/tenant-provisioner.service';

@Controller('tenants')

export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('provision')
  async provision(@Body() dto: ProvisionTenantDto) {
    return this.tenantsService.provision(dto);
  }

  @Get('consumption')
  async getConsumption(@Query('schemaName') schemaName?: string) {
    return this.tenantsService.getConsumption(schemaName);
  }

  @Get()
  async findAll() {
    return this.tenantsService.findAll();
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

