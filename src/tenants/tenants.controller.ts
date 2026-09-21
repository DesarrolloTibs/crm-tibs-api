import { Controller, Get, Post, Put, Patch, Delete, Body, Param, ParseIntPipe, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';

import { TenantsService } from './tenants.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { UpdateTenantPlanDto } from './dto/update-tenant-plan.dto';
import { EnqueueRenewalDto } from './dto/enqueue-renewal.dto';
import { UpdateQueueItemDto } from './dto/update-queue-item.dto';

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

  @Get(':id/renewal-queue')
  async getRenewalQueue(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.getRenewalQueue(id);
  }

  @Put(':id/plan')
  async updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTenantPlanDto
  ) {
    return this.tenantsService.updatePlan(id, body);
  }

  @Post(':id/enqueue-renewal')
  async enqueueRenewal(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EnqueueRenewalDto
  ) {
    return this.tenantsService.enqueueRenewal(id, body);
  }

  @Patch('renewal-queue/:queueItemId')
  async updateQueueItem(
    @Param('queueItemId', ParseIntPipe) queueItemId: number,
    @Body() body: UpdateQueueItemDto
  ) {
    return this.tenantsService.updateQueueItem(queueItemId, body);
  }

  @Delete('renewal-queue/:queueItemId')
  async removeQueueItem(
    @Param('queueItemId', ParseIntPipe) queueItemId: number
  ) {
    return this.tenantsService.removeQueueItem(queueItemId);
  }

  @Delete(':id/renewal-queue')
  async clearRenewalQueue(
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.tenantsService.clearRenewalQueue(id);
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

