import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LoginDto } from '../dto/login.dto';

/**
 * Valida estrictamente el payload de LoginDto antes de ejecutar Passport LocalAuthGuard.
 * Esto evita que AuthGuard('local') procese cuerpos con campos extra, tipos no válidos o emails inválidos.
 */
@Injectable()
export class LoginValidationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const rawBody = req?.body;

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new BadRequestException('El cuerpo de la petición es inválido.');
    }

    const allowedKeys = new Set(['email', 'password']);
    const extraKeys = Object.keys(rawBody).filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      throw new BadRequestException(
        extraKeys.map((key) => `La propiedad ${key} no debería existir`),
      );
    }

    const dto = plainToInstance(LoginDto, rawBody);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    });

    if (errors.length > 0) {
      const messages = errors.flatMap((err) =>
        err.constraints ? Object.values(err.constraints) : ['Datos de inicio de sesión inválidos.'],
      );
      throw new BadRequestException(messages);
    }

    req.body = dto;
    return true;
  }
}
