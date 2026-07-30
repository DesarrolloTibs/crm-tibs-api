import { Injectable, NestMiddleware, ForbiddenException, Logger, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger('TenantMiddleware');

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    let tenantSchema = 'public';
    let userId: string | undefined = undefined;
    let role: string | undefined = undefined;
    let jwtVerified = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const secret = this.configService.get<string>('JWT_SECRET');
      try {
        // Verificación REAL con firma — sustituye el antiguo jwt.decode() inseguro
        const decoded: any = jwt.verify(token, secret!);
        jwtVerified = true;
        userId = decoded.sub || decoded.userId;
        role = decoded.role;

        if (role === 'superadmin') {
          tenantSchema = 'public';
        } else if (decoded.tenant) {
          tenantSchema = decoded.tenant;
        }
      } catch {
        // Token inválido o expirado: se permite continuar sin tenant context.
        // Los guards de autenticación (@UseGuards(AuthGuard('jwt'))) rechazarán
        // la petición si la ruta requiere autenticación.
      }
    }

    // Header x-tenant-schema: solo se acepta si el token fue verificado y el rol es superadmin.
    // En producción se ignora para cualquier otro caso.
    const customTenantHeader = req.headers['x-tenant-schema'] as string;
    if (customTenantHeader) {
      if (jwtVerified && role === 'superadmin' && (customTenantHeader === 'public' || TenantContextService.validateSchemaName(customTenantHeader))) {
        tenantSchema = customTenantHeader;
      } else if (process.env.NODE_ENV === 'production') {
        this.logger.warn(
          `Header x-tenant-schema ignorado: requiere token superadmin verificado. IP: ${req.ip}`,
        );
      }
    }

    // Validar nombre de esquema cuando no es public
    if (tenantSchema !== 'public') {
      if (!TenantContextService.validateSchemaName(tenantSchema)) {
        throw new ForbiddenException(`Nombre de organización/esquema inválido '${tenantSchema}'.`);
      }

      // Validar tenant activo con caché LRU (TTL: 60s) para evitar query a BD en cada request
      const cacheKey = `tenant_active:${tenantSchema}`;
      let tenantActive: boolean | null | undefined = await this.cacheManager.get<boolean>(cacheKey);

      if (tenantActive === null || tenantActive === undefined) {
        // No está en caché — consultar la BD y almacenar resultado
        try {
          const tenants = await this.dataSource.query(
            `SELECT is_active FROM public.tenants WHERE schema_name = $1`,
            [tenantSchema],
          );

          if (tenants.length === 0) {
            // Guardar false en caché para no repetir la query para schemas inexistentes
            await this.cacheManager.set(cacheKey, false, 60000);
            throw new ForbiddenException(`La organización '${tenantSchema}' no existe.`);
          }

          tenantActive = tenants[0].is_active as boolean;
          await this.cacheManager.set(cacheKey, tenantActive, 60000);
        } catch (err) {
          if (err instanceof ForbiddenException) throw err;
          // Si public.tenants no existe aún en el primer inicio, se omite
        }
      }

      if (tenantActive === false) {
        throw new ForbiddenException(
          `La organización '${tenantSchema}' se encuentra INACTIVA o su suscripción ha expirado.`,
        );
      }

      // Asegurar que el esquema del tenant NO almacene usuarios SuperAdmin (los SuperAdmin residen exclusivamente en public.users)
      await this.dataSource.query(`
        DELETE FROM "${tenantSchema}".users WHERE LOWER(role::text) = 'superadmin';
      `).catch(() => null);
    }

    // Ejecutar la petición dentro del contexto aislado de AsyncLocalStorage
    TenantContextService.run(
      { tenantSchema, userId, role },
      () => {
        next();
      },
    );
  }
}
