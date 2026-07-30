import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TenantContextService } from './tenant-context.service';
import { TenantProvisionerService } from './tenant-provisioner.service';

@Global()
@Module({
  imports: [
    // Caché en memoria para validación de tenants activos.
    // TTL: 60 segundos — evita consultar public.tenants en cada request HTTP.
    // max: 500 entradas (capacidad para 500 tenants distintos en el caché).
    CacheModule.register({
      ttl: 60000,
      max: 500,
    }),
  ],
  providers: [TenantContextService, TenantProvisionerService],
  exports: [TenantContextService, TenantProvisionerService, CacheModule],
})
export class TenancyModule {}
