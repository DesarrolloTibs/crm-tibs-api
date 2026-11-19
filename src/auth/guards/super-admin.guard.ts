import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '../../role.enum';

/**
 * Guard de autorización estricto que restringe el acceso únicamente a usuarios con rol SuperAdmin.
 * Debe combinarse después de AuthGuard('jwt') para garantizar que req.user esté autenticado.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;
    const role = (user?.role || '').toString().toLowerCase().trim();

    if (role !== Role.SuperAdmin) {
      throw new ForbiddenException('Solo los usuarios con rol SuperAdmin pueden realizar esta operación.');
    }

    return true;
  }
}
