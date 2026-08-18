import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { CubeQuery, CubeQueryFilter } from '../interfaces/webchat.interfaces';

/**
 * Mapeo de entidades Cube.dev y el campo de filtro por ejecutivo.
 * null = sin filtro (global dentro del tenant), 'BLOCKED' = acceso prohibido para ejecutivos.
 */
export const ENTITY_SECURITY_MAP: Record<string, string | null> = {
  Oportunidades: 'Oportunidades.ejecutivoId',
  Actividades: 'Actividades.userId',
  Gastos: 'Gastos.usuarioId',
  Tickets: 'Tickets.responsableId',
  Clientes: null,       // Global dentro de la organización
  Productos: null,      // Catálogo global
  Usuarios: 'BLOCKED',  // Solo admins y superadmins
};

@Injectable()
export class WebchatSecurityService {
  private readonly logger = new Logger('WebchatSecurityService');

  /**
   * Valida y aplica filtros de seguridad automáticos según el rol.
   * - SuperAdmin: Consulta libre multi-tenant (con o sin userId).
   * - Admin: Consulta global de su organización.
   * - Executive: Solo accede a sus propios datos asignados y tiene bloqueada la entidad Usuarios.
   */
  applySecurityFilters(cubeQuery: CubeQuery | undefined, userId: string, userRole: string): void {
    if (!cubeQuery) return;
    const roleLower = (userRole || '').toLowerCase().trim();
    const isSuper = this.isSuperAdmin(roleLower);
    const isExec = this.isExecutive(roleLower);

    // Admin y Ejecutivo requieren userId válido para identificar la sesión de trabajo
    if (!isSuper && (!userId || !this.isValidUuid(userId))) {
      throw new ForbiddenException(`Se requiere un usuario identificado y válido para realizar consultas.`);
    }

    const allMembers = [
      ...(cubeQuery.measures || []),
      ...(cubeQuery.dimensions || []),
      ...(cubeQuery.filters || []).map((f: CubeQueryFilter) => f.member),
      ...(cubeQuery.timeDimensions || []).map((td: any) => td.dimension),
    ];

    const entities = new Set<string>();
    for (const member of allMembers) {
      if (typeof member === 'string' && member.includes('.')) {
        entities.add(member.split('.')[0]);
      }
    }

    const hasTransactionalEntities =
      entities.has('Oportunidades') ||
      entities.has('Actividades') ||
      entities.has('Gastos') ||
      entities.has('Tickets') ||
      entities.has('Clientes');

    for (const entity of entities) {
      const securityField = ENTITY_SECURITY_MAP[entity];
      if (securityField === 'BLOCKED') {
        if (!hasTransactionalEntities && isExec) {
          throw new ForbiddenException(`No tienes permisos para consultar directamente la entidad "${entity}".`);
        }
      }
    }

    if (!cubeQuery.filters) {
      cubeQuery.filters = [];
    }

    // Para ejecutivos: Forzar estrictamente su propio userId en entidades transaccionales
    if (isExec) {
      for (const entity of entities) {
        const securityField = ENTITY_SECURITY_MAP[entity];
        if (securityField && securityField !== 'BLOCKED') {
          const alreadyFiltered = cubeQuery.filters.some(
            (f: CubeQueryFilter) => f.member === securityField,
          );
          if (!alreadyFiltered) {
            cubeQuery.filters.push({
              member: securityField,
              operator: 'equals',
              values: [userId],
            });
            this.logger.log(`[WebChat - Security] Filtro añadido para ejecutivo (${userId}): ${securityField} = ${userId}`);
          }
        }
      }
    }
  }

  /**
   * Sanitiza los filtros generados por el LLM para evitar errores de sintaxis UUID en base de datos.
   * Maneja placeholders ("me", "yo", "usuario_actual") y consultas globales de SuperAdmin.
   */
  sanitizeFilters(cubeQuery: CubeQuery | undefined, userId: string, userRole: string): void {
    if (!cubeQuery || !cubeQuery.filters) return;

    const roleLower = (userRole || '').toLowerCase().trim();
    const isSuper = this.isSuperAdmin(roleLower);
    const isExec = this.isExecutive(roleLower);
    const isAdminUser = this.isAdmin(roleLower);

    const securityFields = [
      'Oportunidades.ejecutivoId',
      'Actividades.userId',
      'Gastos.usuarioId',
      'Tickets.responsableId',
    ];

    const placeholders = new Set([
      'current_user_id',
      'my_user_id',
      'user_id',
      'me',
      'yo',
      'usuario_actual',
    ]);

    const sanitizedFilters: CubeQueryFilter[] = [];

    for (const filter of cubeQuery.filters) {
      if (securityFields.includes(filter.member)) {
        if (isExec) {
          if (userId && this.isValidUuid(userId)) {
            sanitizedFilters.push({
              ...filter,
              operator: 'equals',
              values: [userId],
            });
          } else {
            throw new ForbiddenException(`Ejecutivo requiere un ID de usuario válido.`);
          }
          continue;
        }

        if (isAdminUser) {
          if (Array.isArray(filter.values)) {
            const hasInvalidOrPlaceholder = filter.values.some((v: any) =>
              typeof v === 'string' && (placeholders.has(v.toLowerCase()) || !this.isValidUuid(v)),
            );
            if (hasInvalidOrPlaceholder) {
              if (userId && this.isValidUuid(userId)) {
                sanitizedFilters.push({
                  ...filter,
                  operator: 'equals',
                  values: [userId],
                });
              } else {
                throw new ForbiddenException(`El rol Admin requiere un ID de usuario válido para filtrar sus datos personales.`);
              }
              continue;
            }
          }
        }

        if (isSuper) {
          if (Array.isArray(filter.values)) {
            const hasInvalidOrPlaceholder = filter.values.some((v: any) =>
              typeof v === 'string' && (placeholders.has(v.toLowerCase()) || !this.isValidUuid(v)),
            );
            if (hasInvalidOrPlaceholder) {
              if (userId && this.isValidUuid(userId)) {
                sanitizedFilters.push({
                  ...filter,
                  operator: 'equals',
                  values: [userId],
                });
              } else {
                this.logger.log(`[WebChat - Sanitize] Consulta Global de SuperAdmin (sin userId) en ${filter.member}. Omitiendo filtro individual.`);
              }
              continue;
            }
          }
        }
      }

      // Sanitizar cualquier otro campo UUID (*Id) para remover valores inventados que rompen PostgreSQL
      const uuidFields = [
        'Oportunidades.stageId',
        'Oportunidades.clienteId',
        'Oportunidades.pipelineId',
        'Tickets.stageId',
        'Tickets.helpdeskId',
        'Tickets.clienteId',
        'Actividades.clientId',
        'Actividades.opportunityId',
        'Gastos.clientId',
        'Gastos.opportunityId',
      ];

      if (filter.member && uuidFields.includes(filter.member)) {
        if (Array.isArray(filter.values)) {
          const validUuids = filter.values.filter((v: any) => typeof v === 'string' && this.isValidUuid(v));
          if (validUuids.length === 0) {
            this.logger.warn(`[WebChat - Sanitize] Filtro UUID ficticio o inválido removido: ${filter.member} = ${JSON.stringify(filter.values)}`);
            continue;
          }
          sanitizedFilters.push({
            ...filter,
            values: validUuids,
          });
          continue;
        }
      }

      sanitizedFilters.push(filter);
    }

    cubeQuery.filters = sanitizedFilters;
  }

  /**
   * Valida si un string cumple con la estructura estándar de un UUID v4.
   */
  isValidUuid(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
  }

  isSuperAdmin(role: string): boolean {
    return (role || '').toLowerCase().trim() === 'superadmin';
  }

  isAdmin(role: string): boolean {
    return (role || '').toLowerCase().trim() === 'admin';
  }

  isExecutive(role: string): boolean {
    const r = (role || '').toLowerCase().trim();
    return r === 'executive' || r === 'ejecutivo';
  }
}
