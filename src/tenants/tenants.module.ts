import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Tenant } from './entities/tenant.entity';
import { TenantRenewalQueue } from './entities/tenant-renewal-queue.entity';
import { TenantBillingCycle } from './entities/tenant-billing-cycle.entity';
import { User } from '../users/entities/user.entity';
import { Plan } from '../plans/entities/plan.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantProvisionerService } from '../tenancy/tenant-provisioner.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StorageModule } from '../storage/storage.module';
import {
  assertSafeUploadParamId,
  createDiskMulterOptions,
  resolveSafeFileExtension,
  TENANT_IMAGE_EXTENSIONS,
} from '../common/utils/upload.util';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, TenantRenewalQueue, TenantBillingCycle, User, Plan]),
    SubscriptionsModule,
    StorageModule,
    MulterModule.register(
      createDiskMulterOptions({
        resolveDestination: (req) => {
          const tenantId = assertSafeUploadParamId((req.params as any)?.id || 'global', 'Tenant ID');
          return `./uploads/tenants/${tenantId}`;
        },
        mode: 'image_with_svg',
        maxFileSizeBytes: 10 * 1024 * 1024,
        filenameBuilder: (_req, file) => {
          const ext = resolveSafeFileExtension(
            file?.originalname || '',
            TENANT_IMAGE_EXTENSIONS,
            'png',
          );
          return `logo_${Date.now()}.${ext}`;
        },
      }),
    ),
  ],

  controllers: [TenantsController],
  providers: [TenantsService, TenantProvisionerService],
  exports: [TenantsService, TenantProvisionerService],
})
export class TenantsModule {}

