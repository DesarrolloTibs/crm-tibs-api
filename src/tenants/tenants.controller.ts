import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
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
import {
  TenantAudioUsageQueryDto,
  TenantBreakdownQueryDto,
  TenantConsumptionQueryDto,
  UpdateAllowExtraDto,
} from './dto/tenant-queries.dto';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('provision')
  @UseGuards(SuperAdminGuard)
  async provision(@Body() dto: ProvisionTenantDto) {
    return this.tenantsService.provision(dto);
  }

  @SkipThrottle()
  @Get('consumption')
  async getConsumption(
    @GetUser() user: User,
    @Query() query: TenantConsumptionQueryDto,
  ) {
    const allowedSchema = await this.tenantsService.resolveAuthorizedSchemaForUser(
      user,
      query.schemaName,
      query.tenantId,
    );
    return this.tenantsService.getConsumption(allowedSchema);
  }

  @SkipThrottle()
  @Get('consumption/breakdown')
  async getConsumptionBreakdown(
    @GetUser() user: User,
    @Query() query: TenantBreakdownQueryDto,
  ) {
    const allowedSchema = await this.tenantsService.resolveAuthorizedSchemaForUser(
      user,
      query.schemaName,
      query.tenantId,
    );
    return this.tenantsService.getConsumptionBreakdown(
      allowedSchema,
      undefined,
      query.cycleId,
      query.startDate,
      query.endDate,
    );
  }

  @SkipThrottle()
  @Get('billing-cycles')
  async getBillingCycles(
    @GetUser() user: User,
    @Query() query: TenantConsumptionQueryDto,
  ) {
    const allowedSchema = await this.tenantsService.resolveAuthorizedSchemaForUser(
      user,
      query.schemaName,
      query.tenantId,
    );
    return this.tenantsService.getBillingCycles(undefined, allowedSchema);
  }

  @Get('courtesy-overages')
  @UseGuards(SuperAdminGuard)
  async getCourtesyOverages() {
    return this.tenantsService.getCourtesyOveragesReport();
  }

  @UseGuards(SuperAdminGuard)
  @Get('audio-usage')
  @ApiOperation({ summary: 'Auditoría interna de duración y uso de audio IBM Speech-to-Text por tenant (solo SuperAdmin)' })
  async getAudioUsage(@Query() query: TenantAudioUsageQueryDto) {
    return this.tenantsService.getAudioUsageReport({
      tenantId: query.tenantId,
      schemaName: query.schemaName,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('my-tenant')
  async getMyTenant(
    @GetUser() user: User,
    @Query() query: TenantConsumptionQueryDto,
  ) {
    const allowedSchema = await this.tenantsService.resolveAuthorizedSchemaForUser(
      user,
      query.schemaName,
      query.tenantId,
    );
    return this.tenantsService.getCurrentTenant(allowedSchema);
  }

  @Get()
  @UseGuards(SuperAdminGuard)
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.tenantsService.assertUserCanManageTenant(id, user);
    if (!file) {
      throw new BadRequestException('Archivo de imagen no proporcionado');
    }
    return this.tenantsService.uploadLogoFile(id, file);
  }

  @Get(':id/consumption')
  @UseGuards(SuperAdminGuard)
  async getTenantConsumptionById(@Param('id', ParseIntPipe) id: number) {
    const tenant = await this.tenantsService.findOne(id);
    return this.tenantsService.getConsumption(tenant.schema_name);
  }

  @UseGuards(SuperAdminGuard)
  @Get(':id/audio-usage')
  @ApiOperation({ summary: 'Auditoría interna de duración de audio IBM Speech-to-Text de un tenant específico (solo SuperAdmin)' })
  async getTenantAudioUsageById(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: TenantAudioUsageQueryDto,
  ) {
    return this.tenantsService.getAudioUsageReport({
      tenantId: id,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get(':id')
  @UseGuards(SuperAdminGuard)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.findOne(id);
  }

  @Get(':id/renewal-queue')
  @UseGuards(SuperAdminGuard)
  async getRenewalQueue(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.getRenewalQueue(id);
  }

  @SkipThrottle()
  @Get(':id/billing-cycles')
  @UseGuards(SuperAdminGuard)
  async getTenantBillingCyclesById(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.getBillingCycles(id);
  }

  @Put(':id/plan')
  @UseGuards(SuperAdminGuard)
  async updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTenantPlanDto,
  ) {
    return this.tenantsService.updatePlan(id, body);
  }

  @Post(':id/enqueue-renewal')
  @UseGuards(SuperAdminGuard)
  async enqueueRenewal(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EnqueueRenewalDto,
  ) {
    return this.tenantsService.enqueueRenewal(id, body);
  }

  @Patch('renewal-queue/:queueItemId')
  @UseGuards(SuperAdminGuard)
  async updateQueueItem(
    @Param('queueItemId', ParseIntPipe) queueItemId: number,
    @Body() body: UpdateQueueItemDto,
  ) {
    return this.tenantsService.updateQueueItem(queueItemId, body);
  }

  @Delete('renewal-queue/:queueItemId')
  @UseGuards(SuperAdminGuard)
  async removeQueueItem(
    @Param('queueItemId', ParseIntPipe) queueItemId: number,
  ) {
    return this.tenantsService.removeQueueItem(queueItemId);
  }

  @Delete(':id/renewal-queue')
  @UseGuards(SuperAdminGuard)
  async clearRenewalQueue(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tenantsService.clearRenewalQueue(id);
  }

  @Put(':id/allow-extra')
  @UseGuards(SuperAdminGuard)
  async updateAllowExtra(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAllowExtraDto,
  ) {
    return this.tenantsService.updateAllowExtra(id, body.allowExtra);
  }

  @UseGuards(SuperAdminGuard)
  @Put(':id/ibm-audio')
  @ApiOperation({ summary: 'Habilitar o deshabilitar el add-on de audio IBM Speech-to-Text para un tenant (solo SuperAdmin)' })
  async updateIbmAudio(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTenantIbmAudioDto,
  ) {
    return this.tenantsService.updateIbmAudio(id, body.ibm_audio_enabled);
  }

  @UseGuards(SuperAdminGuard)
  @Patch(':id/ibm-audio')
  @ApiOperation({ summary: 'Habilitar o deshabilitar el add-on de audio IBM Speech-to-Text para un tenant (solo SuperAdmin)' })
  async patchIbmAudio(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTenantIbmAudioDto,
  ) {
    return this.tenantsService.updateIbmAudio(id, body.ibm_audio_enabled);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
    @Body() body: UpdateTenantDto,
  ) {
    const role = (user?.role || '').toString().toLowerCase().trim();
    if (body.ibm_audio_enabled !== undefined && role !== Role.SuperAdmin) {
      throw new ForbiddenException('Solo los usuarios con rol SuperAdmin pueden modificar el soporte de audio IBM.');
    }
    if ((body.is_active !== undefined || body.allow_extra !== undefined) && role !== Role.SuperAdmin) {
      throw new ForbiddenException('Solo los usuarios con rol SuperAdmin pueden modificar el estado activo o consumo extra de una organización.');
    }
    if (role !== Role.SuperAdmin) {
      await this.tenantsService.assertUserCanManageTenant(id, user);
    }
    return this.tenantsService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.remove(id);
  }
}

