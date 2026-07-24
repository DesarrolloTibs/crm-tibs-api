import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantRenewalQueue } from './entities/tenant-renewal-queue.entity';
import { User } from '../users/entities/user.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantProvisionerService } from '../tenancy/tenant-provisioner.service';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, TenantRenewalQueue, User]),
    SubscriptionsModule,
  ],

  controllers: [TenantsController],
  providers: [TenantsService, TenantProvisionerService],
  exports: [TenantsService, TenantProvisionerService],
})
export class TenantsModule {}

