import { Injectable, NestMiddleware, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly dataSource: DataSource) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    let tenantSchema = 'public';
    let userId: string | undefined = undefined;
    let role: string | undefined = undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded: any = jwt.decode(token);
        if (decoded) {
          userId = decoded.sub || decoded.userId;
          role = decoded.role;

          if (role === 'superadmin') {
            tenantSchema = 'public';
          } else if (decoded.tenant) {
            tenantSchema = decoded.tenant;
          }
        }
      } catch (e) {
        // Ignorar si el token no se pudo decodificar en el middleware, el AuthGuard se encargará de rechazarlo si la ruta requiere auth.
      }
    }

    // Permitir header override explícito para peticiones de desarrollo o servicios inter-modulo si aplica
    const customTenantHeader = req.headers['x-tenant-schema'] as string;
    if (customTenantHeader && TenantContextService.validateSchemaName(customTenantHeader)) {
      tenantSchema = customTenantHeader;
    }

    // Validar nombre de esquema si no es public
    if (tenantSchema !== 'public') {
      if (!TenantContextService.validateSchemaName(tenantSchema)) {
        throw new ForbiddenException(`Nombre de organización/esquema inválido '${tenantSchema}'.`);
      }

      // Validar que el tenant exista y esté activo en public.tenants
      try {
        const tenants = await this.dataSource.query(
          `SELECT is_active FROM public.tenants WHERE schema_name = $1`,
          [tenantSchema]
        );

        if (tenants.length === 0) {
          throw new ForbiddenException(`La organización '${tenantSchema}' no existe.`);
        }

        if (!tenants[0].is_active) {
          throw new ForbiddenException(`La organización '${tenantSchema}' se encuentra INACTIVA o su suscripción ha expirado.`);
        }
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
        // Si las tablas de public.tenants no existen aún durante inicio inicial, se omite
      }
    }

    // Ejecutar la petición en el contexto aislado de AsyncLocalStorage
    TenantContextService.run(
      { tenantSchema, userId, role },
      () => {
        next();
      }
    );
  }
}
