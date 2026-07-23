import { Module, Global } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantProvisionerService } from './tenant-provisioner.service';

@Global()
@Module({
  providers: [TenantContextService, TenantProvisionerService],
  exports: [TenantContextService, TenantProvisionerService],
})
export class TenancyModule {}
