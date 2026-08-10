import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';

export interface TenantContextStore {
  tenantSchema: string;
  userId?: string;
  role?: string;
}

/**
 * Schemas de PostgreSQL reservados que NUNCA deben ser usados como tenant.
 * Incluye schemas del sistema y el schema público de la aplicación.
 */
const RESERVED_SCHEMAS = new Set([
  'public',
  'information_schema',
  'pg_catalog',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
]);

let isQueryRunnerPatched = false;

/**
 * Parchea el QueryRunner de TypeORM para multi-tenancy basado en search_path.
 *
 * ## Flujo de AsyncLocalStorage + Pool de conexiones:
 * 1. Por cada request HTTP, TenantMiddleware llama a TenantContextService.run(store, callback).
 * 2. AsyncLocalStorage almacena el store {tenantSchema, userId, role} en el contexto de la
 *    fibra/async de esa request específica — completamente aislado de otras requests concurrentes.
 * 3. Cuando TypeORM ejecuta cualquier query SQL, este patch intercepta y verifica si el
 *    QueryRunner ya tiene el search_path correcto para este tenant en esta conexión.
 * 4. Si difiere, ejecuta `SET search_path TO "${schema}", public` antes de la query real.
 *    Esto es seguro porque:
 *    - AsyncLocalStorage garantiza que getTenantSchema() devuelve el schema del request actual.
 *    - El __tenant_schema__ se almacena en la instancia del QueryRunner, no en la conexión
 *      del pool, por lo que no contamina otras requests que reutilicen la misma conexión.
 * 5. Las queries de transacción (BEGIN/COMMIT/ROLLBACK) y las queries de sistema se omiten
 *    para evitar efectos secundarios en la gestión interna de TypeORM.
 *
 * ⚠️ IMPORTANTE: Este patch aplica al prototype de PostgresQueryRunner, por lo que debe
 * ejecutarse UNA SOLA VEZ al arrancar el módulo, antes de cualquier query.
 */
export function patchTypeORMQueryRunnerForMultiTenancy() {
  if (isQueryRunnerPatched) return;
  isQueryRunnerPatched = true;

  const originalQuery = PostgresQueryRunner.prototype.query;

  PostgresQueryRunner.prototype.query = async function (
    query: string,
    parameters?: any[],
    useRunInTransaction?: boolean,
  ) {
    const rawSchema = TenantContextService.getTenantSchema();
    const targetSchema = (rawSchema && (rawSchema === 'public' || TenantContextService.validateSchemaName(rawSchema)))
      ? rawSchema
      : 'public';

    // Aplicar search_path solo cuando:
    // 1. No es una query de gestión de search_path (evitar recursión).
    // 2. No es una query de sistema (SHOW, information_schema, pg_catalog).
    // 3. No es una instrucción de control de transacción (BEGIN/COMMIT/ROLLBACK/SAVEPOINT).
    
    if (
      !query.startsWith('SET search_path') &&
      !query.startsWith('SHOW ') &&
      !query.startsWith('BEGIN') &&
      !query.startsWith('COMMIT') &&
      !query.startsWith('ROLLBACK') &&
      !query.startsWith('SAVEPOINT') &&
      !query.startsWith('RELEASE SAVEPOINT') &&
      !query.includes('information_schema') &&
      !query.includes('pg_catalog')
    ) {
      // Para garantizar un aislamiento multitenant robusto en pools de conexión y poolers de Supabase/PgBouncer,
      // siempre forzamos el SET search_path en cada instancia de QueryRunner. No confiamos en el estado en caché
      // del cliente físico (physicalClient), ya que en poolers de transacción este cambia o se limpia constantemente.
      if ((this as any).__tenant_schema__ !== targetSchema) {
        try {
          if (targetSchema === 'public') {
            await originalQuery.call(this, `SET search_path TO public`);
          } else {
            await originalQuery.call(this, `SET search_path TO "${targetSchema}", public`);
          }
          (this as any).__tenant_schema__ = targetSchema;
        } catch {
          // Si falla SET search_path (e.g., conexión aún no establecida), se continúa
        }
      }
    }

    // Compatibilidad: reemplazar uuid_generate_v4() por gen_random_uuid() (pgcrypto vs nativo PG14+)
    if (typeof query === 'string' && query.includes('uuid_generate_v4()')) {
      query = query.replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');
    }

    return originalQuery.call(this, query, parameters, useRunInTransaction);
  };
}

// Aplicar el patch al importar el módulo (una sola vez en el ciclo de vida de la aplicación)
patchTypeORMQueryRunnerForMultiTenancy();

@Injectable()
export class TenantContextService {
  /**
   * AsyncLocalStorage es el mecanismo de aislamiento por request.
   * Cada llamada a .run(store, callback) crea un contexto async aislado donde
   * .getStore() devuelve únicamente el store de ESA request, sin importar la concurrencia.
   */
  private static readonly asyncLocalStorage = new AsyncLocalStorage<TenantContextStore>();

  /**
   * Ejecuta una función dentro de un contexto de tenant aislado.
   * Llamado por TenantMiddleware en cada request HTTP entrante.
   */
  static run<R>(store: TenantContextStore, callback: () => R): R {
    return this.asyncLocalStorage.run(store, callback);
  }

  /**
   * Retorna el store completo del contexto actual o undefined si no hay contexto.
   */
  static getStore(): TenantContextStore | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Retorna el schema del tenant del request actual.
   * Devuelve 'public' si no hay contexto (e.g., tareas de cron, bootstrap).
   */
  static getTenantSchema(): string {
    const store = this.asyncLocalStorage.getStore();
    return store?.tenantSchema || 'public';
  }

  /**
   * Valida que el nombre de schema sea seguro para usar en SET search_path.
   * Reglas:
   * - Solo letras minúsculas, números y guiones bajos.
   * - Máximo 63 caracteres (límite de PostgreSQL para identificadores).
   * - No puede empezar con 'pg_' (reservado por PostgreSQL).
   * - No puede ser un schema reservado del sistema (excepto 'public' que es el esquema base).
   */
  static validateSchemaName(schemaName: string): boolean {
    if (!schemaName || schemaName.length > 63) {
      return false;
    }
    if (schemaName === 'public') {
      return true;
    }
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      return false;
    }
    if (schemaName.startsWith('pg_')) {
      return false;
    }
    if (RESERVED_SCHEMAS.has(schemaName)) {
      return false;
    }
    return true;
  }

  /**
   * Genera un slug válido para nombre de schema a partir de un nombre de tenant.
   * Ejemplo: "Mi Empresa S.A." → "tenant_mi_empresa_s_a"
   */
  static generateSlug(tenantName: string): string {
    let slug = tenantName.toLowerCase();
    slug = slug.replace(/[^a-z0-9_]/g, '_');
    slug = slug.replace(/_+/g, '_');
    slug = slug.replace(/^_+|_+$/g, '');
    return `tenant_${slug}`;
  }
}
