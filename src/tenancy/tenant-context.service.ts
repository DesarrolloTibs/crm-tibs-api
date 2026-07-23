import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';

export interface TenantContextStore {
  tenantSchema: string;
  userId?: string;
  role?: string;
}

let isQueryRunnerPatched = false;
const migratedSchemas = new Set<string>();

export function patchTypeORMQueryRunnerForMultiTenancy() {
  if (isQueryRunnerPatched) return;
  isQueryRunnerPatched = true;

  const originalQuery = PostgresQueryRunner.prototype.query;

  PostgresQueryRunner.prototype.query = async function (
    query: string,
    parameters?: any[],
    useRunInTransaction?: boolean
  ) {
    const tenantSchema = TenantContextService.getTenantSchema();

    if (
      tenantSchema &&
      !query.startsWith('SET search_path') &&
      !query.startsWith('SHOW ') &&
      !query.includes('information_schema') &&
      !query.includes('pg_catalog')
    ) {
      const currentAttachedSchema = (this as any).__tenant_schema__;
      if (currentAttachedSchema !== tenantSchema) {
        try {
          await originalQuery.call(this, `SET search_path TO "${tenantSchema}", public`);
          (this as any).__tenant_schema__ = tenantSchema;
        } catch (e) {
          // Ignorar si falla la asignación de esquema previa
        }
      }
    }

    if (typeof query === 'string' && query.includes('uuid_generate_v4()')) {
      query = query.replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');
    }

    return originalQuery.call(this, query, parameters, useRunInTransaction);
  };
}


// Ejecutar el parche al importar el servicio de contexto de tenancy
patchTypeORMQueryRunnerForMultiTenancy();

@Injectable()
export class TenantContextService {
  private static readonly asyncLocalStorage = new AsyncLocalStorage<TenantContextStore>();

  static run<R>(store: TenantContextStore, callback: () => R): R {
    return this.asyncLocalStorage.run(store, callback);
  }

  static getStore(): TenantContextStore | undefined {
    return this.asyncLocalStorage.getStore();
  }

  static getTenantSchema(): string {
    const store = this.asyncLocalStorage.getStore();
    return store?.tenantSchema || 'public';
  }

  static validateSchemaName(schemaName: string): boolean {
    if (!schemaName || schemaName.length > 63) {
      return false;
    }
    return /^[a-z0-9_]+$/.test(schemaName);
  }

  static generateSlug(tenantName: string): string {
    let slug = tenantName.toLowerCase();
    slug = slug.replace(/[^a-z0-9_]/g, '_');
    slug = slug.replace(/_+/g, '_');
    slug = slug.replace(/^_+|_+$/g, '');
    return `tenant_${slug}`;
  }
}

