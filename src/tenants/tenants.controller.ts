import { Controller, Get, Post, Put, Patch, Delete, Body, Param, ParseIntPipe, Query, UseInterceptors, UploadedFile, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantsService } from './tenants.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { UpdateTenantPlanDto } from './dto/update-tenant-plan.dto';
import { EnqueueRenewalDto } from './dto/enqueue-renewal.dto';
import { UpdateQueueItemDto } from './dto/update-queue-item.dto';
import { UpdateTenantIbmAudioDto } from './dto/update-tenant-ibm-audio.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('provision')
  async provision(@Body() dto: ProvisionTenantDto) {
    return this.tenantsService.provision(dto);
  }

  @SkipThrottle()
  @Get('consumption')
  async getConsumption(
    @Query('schemaName') schemaName?: string,
    @Query('tenantId') tenantId?: number,
  ) {
    if (tenantId) {
      const tenant = await this.tenantsService.findOne(Number(tenantId));
      return this.tenantsService.getConsumption(tenant.schema_name);
    }
    return this.tenantsService.getConsumption(schemaName);
  }

  @SkipThrottle()
  @Get('consumption/breakdown')
  async getConsumptionBreakdown(
    @Query('schemaName') schemaName?: string,
    @Query('tenantId') tenantId?: number,
    @Query('cycleId') cycleId?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.tenantsService.getConsumptionBreakdown(
      schemaName,
      tenantId ? Number(tenantId) : undefined,
      cycleId ? Number(cycleId) : undefined,
      startDate,
      endDate
    );
  }

  @SkipThrottle()
  @Get('billing-cycles')
  async getBillingCycles(
    @Query('tenantId') tenantId?: number,
    @Query('schemaName') schemaName?: string,
  ) {
    return this.tenantsService.getBillingCycles(
      tenantId ? Number(tenantId) : undefined,
      schemaName,
    );
  }

  @Get('courtesy-overages')
  async getCourtesyOverages() {
    return this.tenantsService.getCourtesyOveragesReport();
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  @Get('audio-usage')
  @ApiOperation({ summary: 'Auditoría interna de duración y uso de audio IBM Speech-to-Text por tenant (solo SuperAdmin)' })
  async getAudioUsage(
    @Query('schemaName') schemaName?: string,
    @Query('tenantId') tenantId?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.tenantsService.getAudioUsageReport({
      tenantId: tenantId ? Number(tenantId) : undefined,
      schemaName,
      startDate,
      endDate,
    });
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
    return this.tenantsService.uploadLogoFile(id, file);
  }

  @Get(':id/consumption')
  async getTenantConsumptionById(@Param('id', ParseIntPipe) id: number) {
    const tenant = await this.tenantsService.findOne(id);
    return this.tenantsService.getConsumption(tenant.schema_name);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  @Get(':id/audio-usage')
  @ApiOperation({ summary: 'Auditoría interna de duración de audio IBM Speech-to-Text de un tenant específico (solo SuperAdmin)' })
  async getTenantAudioUsageById(
    @Param('id', ParseIntPipe) id: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.tenantsService.getAudioUsageReport({
      tenantId: id,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.findOne(id);
  }

  @Get(':id/renewal-queue')
  async getRenewalQueue(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.getRenewalQueue(id);
  }

  @SkipThrottle()
  @Get(':id/billing-cycles')
  async getTenantBillingCyclesById(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.getBillingCycles(id);
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

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  @Put(':id/ibm-audio')
  @ApiOperation({ summary: 'Habilitar o deshabilitar el add-on de audio IBM Speech-to-Text para un tenant (solo SuperAdmin)' })
  async updateIbmAudio(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTenantIbmAudioDto,
  ) {
    return this.tenantsService.updateIbmAudio(id, body.ibm_audio_enabled);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  @Patch(':id/ibm-audio')
  @ApiOperation({ summary: 'Habilitar o deshabilitar el add-on de audio IBM Speech-to-Text para un tenant (solo SuperAdmin)' })
  async patchIbmAudio(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTenantIbmAudioDto,
  ) {
    return this.tenantsService.updateIbmAudio(id, body.ibm_audio_enabled);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
    @Body() body: UpdateTenantDto,
  ) {
    if (body.ibm_audio_enabled !== undefined) {
      const role = (user?.role || '').toString().toLowerCase().trim();
      if (role !== Role.SuperAdmin) {
        throw new ForbiddenException('Solo los usuarios con rol SuperAdmin pueden modificar el soporte de audio IBM.');
      }
    }
    return this.tenantsService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.remove(id);
  }
}

