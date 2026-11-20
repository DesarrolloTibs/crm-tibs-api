import { Logger, ValidationPipe } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import * as jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { Role } from '../../role.enum';

export interface WsAuthenticatedUser {
  id?: string;
  role?: string;
  tenantSchema: string;
}

export class WsTenantPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(63)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'El identificador del esquema contiene caracteres no permitidos.',
  })
  tenantSchema: string;
}

export class WsRegisterUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId: string;
}

export function createWsValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) => new WsException(errors),
  });
}

function isValidTargetSchema(schemaName: unknown): schemaName is string {
  if (typeof schemaName !== 'string' || !schemaName) return false;
  return schemaName === 'public' || TenantContextService.validateSchemaName(schemaName);
}

function extractSocketToken(client: Socket): string | undefined {
  const authHeader = client.handshake.headers?.authorization;
  return (
    (client.handshake.auth?.token as string) ||
    (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : undefined) ||
    (client.handshake.query?.token as string)
  );
}

/**
 * Autentica la conexión Socket.IO con JWT y une el socket únicamente a salas autorizadas.
 */
export function authenticateTenantSocket(
  client: Socket,
  logger: Logger,
  gatewayLabel: string,
  options?: { requireUserId?: boolean },
): boolean {
  const token = extractSocketToken(client);

  if (!token) {
    logger.warn(`Client ${client.id} rechazado en ${gatewayLabel} WS: Token JWT ausente`);
    client.disconnect(true);
    return false;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET no está configurado en las variables de entorno');

    const decoded: any = jwt.verify(token, secret);
    const role = (decoded.role || '').toString().toLowerCase().trim();
    const isSuperAdmin = role === Role.SuperAdmin;
    const rawTokenTenant = decoded.tenantSchema || decoded.tenant || 'public';
    const tokenTenant = isValidTargetSchema(rawTokenTenant) ? rawTokenTenant : 'public';

    const requestedTenant =
      (client.handshake.auth?.tenantSchema as string) ||
      (client.handshake.query?.tenantSchema as string) ||
      (client.handshake.headers?.['x-tenant-schema'] as string) ||
      tokenTenant;

    // Solo SuperAdmin puede suscribirse en el handshake a un tenant distinto al suyo
    const tenantSchema =
      isSuperAdmin && isValidTargetSchema(requestedTenant)
        ? requestedTenant
        : tokenTenant;

    const userId = decoded.sub || decoded.userId || decoded.id;
    if (options?.requireUserId && !userId) {
      throw new Error('ID de usuario no presente en payload JWT');
    }

    (client as any).user = {
      id: userId,
      role,
      tenantSchema: tokenTenant,
    } satisfies WsAuthenticatedUser;
    (client as any).tenantSchema = tenantSchema;
    (client as any).userId = userId;

    client.join(`tenant:${tenantSchema}`);
    if (tokenTenant !== tenantSchema) {
      client.join(`tenant:${tokenTenant}`);
    }
    if (userId) {
      client.join(`user_${userId}`);
      client.join(`user:${userId}`);
    }

    logger.log(`Client ${client.id} conectado a ${gatewayLabel} WS (tenant: ${tenantSchema}, user: ${userId})`);
    return true;
  } catch (err: any) {
    logger.warn(`Client ${client.id} rechazado en ${gatewayLabel} WS: JWT inválido (${err.message})`);
    client.disconnect(true);
    return false;
  }
}

/**
 * Valida y aplica cambio o ingreso de sala multi-tenant respetando el rol autenticado.
 */
export function handleAuthorizedTenantRoom(
  client: Socket,
  logger: Logger,
  data: { tenantSchema?: string } | undefined,
  mode: 'set' | 'join',
) {
  const requested = data?.tenantSchema?.trim();
  if (!requested || !isValidTargetSchema(requested)) {
    return { status: 'invalid_tenant' };
  }

  const user = (client as any).user as WsAuthenticatedUser | undefined;
  const isSuperAdmin = user?.role === Role.SuperAdmin;
  const tokenTenant = user?.tenantSchema;

  if (!user || (!isSuperAdmin && (!tokenTenant || requested !== tokenTenant || requested === 'public'))) {
    logger.warn(`Client ${client.id} intentó ${mode}_tenant a un tenant no autorizado (${requested})`);
    return { status: 'forbidden' };
  }

  if (mode === 'set') {
    const current = (client as any).tenantSchema;
    if (current && current !== requested) {
      client.leave(`tenant:${current}`);
    }
    (client as any).tenantSchema = requested;
  }

  client.join(`tenant:${requested}`);
  logger.log(
    mode === 'set'
      ? `Client ${client.id} cambió de tenant a tenant:${requested}`
      : `Client ${client.id} joined room tenant:${requested}`,
  );
  return { status: 'ok', room: `tenant:${requested}` };
}
