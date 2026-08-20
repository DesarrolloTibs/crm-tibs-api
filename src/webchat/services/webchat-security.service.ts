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
  Clientes: 'Clientes.ejecutivoId', // Asignación a ejecutivo en clientes
  Empresas: 'Empresas.ejecutivoId', // Asignación a ejecutivo en empresas/cuentas
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

    const extractFilterMembers = (filters: any[]): string[] => {
      const members: string[] = [];
      for (const f of filters || []) {
        if (!f) continue;
        if (typeof f.member === 'string') members.push(f.member);
        if (f.or && Array.isArray(f.or)) members.push(...extractFilterMembers(f.or));
        if (f.and && Array.isArray(f.and)) members.push(...extractFilterMembers(f.and));
      }
      return members;
    };

    const allMembers = [
      ...(cubeQuery.measures || []),
      ...(cubeQuery.dimensions || []),
      ...extractFilterMembers(cubeQuery.filters || []),
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
      entities.has('Clientes') ||
      entities.has('Empresas');

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

    // Para ejecutivos: Eliminar cualquier filtro ajeno a Usuarios y forzar estrictamente su propio userId
    if (isExec) {
      const cleanExecFilters = (filters: any[]): any[] => {
        if (!filters || !Array.isArray(filters)) return [];
        const result: any[] = [];
        for (const f of filters) {
          if (!f) continue;
          if (f.or && Array.isArray(f.or)) {
            const cleanedOr = cleanExecFilters(f.or);
            if (cleanedOr.length > 0) result.push({ or: cleanedOr });
            continue;
          }
          if (f.and && Array.isArray(f.and)) {
            const cleanedAnd = cleanExecFilters(f.and);
            if (cleanedAnd.length > 0) result.push({ and: cleanedAnd });
            continue;
          }
          if (f.member && f.member.startsWith('Usuarios.')) {
            continue;
          }
          result.push(f);
        }
        return result;
      };

      cubeQuery.filters = cleanExecFilters(cubeQuery.filters);

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
   * Maneja placeholders ("me", "yo", "usuario_actual"), nombres en texto (convirtiéndolos a Usuarios.username para Admin)
   * y consultas globales de SuperAdmin.
   */
  sanitizeFilters(cubeQuery: CubeQuery | undefined, userId: string, userRole: string): void {
    if (!cubeQuery || !cubeQuery.filters) return;
    cubeQuery.filters = this.sanitizeFilterList(cubeQuery.filters, userId, userRole);
  }

  /**
   * Sanitiza recursivamente una lista de filtros, soportando bloques OR y AND.
   */
  private sanitizeFilterList(filters: any[], userId: string, userRole: string): any[] {
    if (!filters || !Array.isArray(filters)) return [];

    const roleLower = (userRole || '').toLowerCase().trim();
    const isSuper = this.isSuperAdmin(roleLower);
    const isExec = this.isExecutive(roleLower);
    const isAdminUser = this.isAdmin(roleLower);

    const securityFields = [
      'Oportunidades.ejecutivoId',
      'Actividades.userId',
      'Gastos.usuarioId',
      'Tickets.responsableId',
      'Clientes.ejecutivoId',
      'Empresas.ejecutivoId',
    ];

    const placeholders = new Set([
      'current_user_id',
      'my_user_id',
      'user_id',
      'me',
      'yo',
      'usuario_actual',
    ]);

    const uuidFields = [
      'Oportunidades.stageId',
      'Oportunidades.clienteId',
      'Oportunidades.companyId',
      'Oportunidades.pipelineId',
      'Clientes.companyId',
      'Clientes.ejecutivoId',
      'Empresas.ejecutivoId',
      'Tickets.stageId',
      'Tickets.helpdeskId',
      'Tickets.clienteId',
      'Actividades.clientId',
      'Actividades.opportunityId',
      'Gastos.clientId',
      'Gastos.opportunityId',
    ];

    const sanitizedFilters: any[] = [];

    for (const filter of filters) {
      if (!filter) continue;

      if (filter.or && Array.isArray(filter.or)) {
        const sanitizedOr = this.sanitizeFilterList(filter.or, userId, userRole);
        if (sanitizedOr.length > 0) {
          sanitizedFilters.push({ or: sanitizedOr });
        }
        continue;
      }

      if (filter.and && Array.isArray(filter.and)) {
        const sanitizedAnd = this.sanitizeFilterList(filter.and, userId, userRole);
        if (sanitizedAnd.length > 0) {
          sanitizedFilters.push({ and: sanitizedAnd });
        }
        continue;
      }

      // Descartar filtros inexistentes o inventados en catálogos globales como Productos
      if (filter.member) {
        const lowerMem = filter.member.toLowerCase();
        if (
          lowerMem.startsWith('productos.ejecutivoid') ||
          lowerMem.startsWith('productos.userid') ||
          lowerMem.startsWith('productos.responsableid') ||
          lowerMem.startsWith('productos.usuarioid')
        ) {
          this.logger.warn(`[WebChat - Sanitize] Filtro descartado por no existir en el catálogo de productos: ${filter.member}`);
          continue;
        }
      }

      // Para ejecutivos: Bloquear cualquier intento de filtrar por la entidad Usuarios
      if (isExec && filter.member && filter.member.startsWith('Usuarios.')) {
        this.logger.warn(`[WebChat - Security] Filtro descartado para ejecutivo: ${filter.member}`);
        continue;
      }

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

        if (isAdminUser || isSuper) {
          if (Array.isArray(filter.values) && filter.values.length > 0) {
            const hasPlaceholder = filter.values.some((v: any) =>
              typeof v === 'string' && placeholders.has(v.toLowerCase()),
            );

            if (hasPlaceholder) {
              if (userId && this.isValidUuid(userId)) {
                sanitizedFilters.push({
                  ...filter,
                  operator: 'equals',
                  values: [userId],
                });
              } else if (isSuper) {
                this.logger.log(`[WebChat - Sanitize] Consulta Global de SuperAdmin (sin userId) en ${filter.member}. Omitiendo filtro individual.`);
              } else {
                throw new ForbiddenException(`El rol Admin requiere un ID de usuario válido para filtrar sus datos personales.`);
              }
              continue;
            }

            const validUuids = filter.values.filter((v: any) => typeof v === 'string' && this.isValidUuid(v));
            if (validUuids.length > 0) {
              sanitizedFilters.push({
                ...filter,
                operator: 'equals',
                values: validUuids,
              });
              continue;
            }

            // Si el valor es un string de nombre (ej. "Carlos" o "Juan"), transformarlo a filtro de Usuarios.username
            const nonUuidStrings = filter.values.filter((v: any) => typeof v === 'string' && v.trim().length > 0);
            if (nonUuidStrings.length > 0) {
              this.logger.log(`[WebChat - Sanitize] Nombre de usuario detectado en ${filter.member} ("${nonUuidStrings.join(', ')}"). Redirigiendo a Usuarios.username.`);
              sanitizedFilters.push({
                member: 'Usuarios.username',
                operator: 'contains',
                values: nonUuidStrings,
              });
              continue;
            }
          }
        }
      }

      // Sanitizar cualquier otro campo UUID (*Id) para remover valores inventados que rompen PostgreSQL
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

    return sanitizedFilters;
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
