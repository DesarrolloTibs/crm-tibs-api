import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
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
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          const tenantId = (req.params as any).id || 'global';
          const uploadPath = `./uploads/tenants/${tenantId}`;
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const timestamp = Date.now();
          const ext = file.originalname.split('.').pop() || 'png';
          cb(null, `logo_${timestamp}.${ext}`);
        },
      }),
    }),
  ],

  controllers: [TenantsController],
  providers: [TenantsService, TenantProvisionerService],
  exports: [TenantsService, TenantProvisionerService],
})
export class TenantsModule {}

