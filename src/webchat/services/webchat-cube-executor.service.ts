import { Injectable, Logger } from '@nestjs/common';
import { AiAgentService } from '../../conversations/ai-agent.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { CubeExecutionResult, CubeAnnotation, CubeQuery, CubeTimeDimension } from '../interfaces/webchat.interfaces';

@Injectable()
export class WebchatCubeExecutorService {
  private readonly logger = new Logger('WebchatCubeExecutorService');

  constructor(private readonly aiAgentService: AiAgentService) {}

  /**
   * Ejecuta una query individual contra la REST API de la Capa Semántica (Cube.dev).
   * Retorna tanto las filas de datos como los metadatos de anotaciones (formatos, medidas, etc.).
   */
  async executeCubeQuery(cubeQuery: CubeQuery | undefined): Promise<CubeExecutionResult> {
    if (!cubeQuery) return { data: [] };
    const tenantSchema = TenantContextService.getTenantSchema() || 'public';

    try {
      let orderFormatted = cubeQuery.order;
      if (orderFormatted && !Array.isArray(orderFormatted)) {
        orderFormatted = Object.entries(orderFormatted) as any;
      }

      const queryPayload: any = {};
      if (cubeQuery.measures && cubeQuery.measures.length > 0) {
        queryPayload.measures = cubeQuery.measures;
      }
      if (cubeQuery.dimensions && cubeQuery.dimensions.length > 0) {
        // Excluir primary keys (*.id) que Cube.dev oculta por defecto para evitar error 400 hidden member
        const filteredDims = cubeQuery.dimensions.filter(
          (d: string) => typeof d === 'string' && !d.toLowerCase().endsWith('.id') && d.toLowerCase() !== 'id'
        );
        if (filteredDims.length > 0) {
          queryPayload.dimensions = filteredDims;
        }
      }
      if (cubeQuery.filters && cubeQuery.filters.length > 0) {
        const sanitizedFilters = this.sanitizeQueryFilters(cubeQuery.filters);
        if (sanitizedFilters.length > 0) {
          queryPayload.filters = sanitizedFilters;
        }
      }
      if (orderFormatted) {
        queryPayload.order = orderFormatted;
      }
      if (cubeQuery.limit) {
        queryPayload.limit = cubeQuery.limit;
      }
      if (cubeQuery.timeDimensions && cubeQuery.timeDimensions.length > 0) {
        const sanitizedTimeDimensions = this.sanitizeTimeDimensions(cubeQuery.timeDimensions);
        if (sanitizedTimeDimensions.length > 0) {
          queryPayload.timeDimensions = sanitizedTimeDimensions;
        }
      }

      this.logger.log(`[Cube Executor - Query] Schema: ${tenantSchema} -> ${JSON.stringify(queryPayload)}`);

      const token = this.aiAgentService.getCubeApiToken(tenantSchema);
      const cubeApiUrl = process.env.CUBE_API_URL || 'http://127.0.0.1:4000';

      const response = await fetch(`${cubeApiUrl}/cubejs-api/v1/load`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'x-tenant-schema': tenantSchema,
          'x-tenant-id': tenantSchema,
        },
        body: JSON.stringify({
          query: queryPayload,
          securityContext: { tenantSchema },
        }),
      });

      if (response.ok) {
        const resJson: any = await response.json();
        return {
          data: resJson?.data || [],
          annotation: resJson?.annotation,
        };
      } else {
        const errText = await response.text();
        this.logger.error(`[Cube Executor - Error] Status ${response.status}: ${errText}`);
      }
    } catch (error: any) {
      this.logger.error(`[Cube Executor - Conexión Fallida] ${error.message}`);
    }

    return { data: [] };
  }

  /**
   * Ejecuta múltiples consultas a Cube.dev en paralelo y consolida sus resultados y anotaciones.
   */
  async executeBatchCubeQueries(cubeQueries: CubeQuery[]): Promise<CubeExecutionResult> {
    if (!cubeQueries || cubeQueries.length === 0) return { data: [] };

    const promises = cubeQueries.map(q => this.executeCubeQuery(q));
    const results = await Promise.allSettled(promises);

    const consolidatedData: any[] = [];
    const mergedAnnotation: CubeAnnotation = {
      measures: {},
      dimensions: {},
    };

    for (const res of results) {
      if (res.status === 'fulfilled' && res.value?.data && Array.isArray(res.value.data)) {
        consolidatedData.push(...res.value.data);
        if (res.value.annotation) {
          if (res.value.annotation.measures) {
            Object.assign(mergedAnnotation.measures!, res.value.annotation.measures);
          }
          if (res.value.annotation.dimensions) {
            Object.assign(mergedAnnotation.dimensions!, res.value.annotation.dimensions);
          }
        }
      }
    }

    return {
      data: consolidatedData,
      annotation: mergedAnnotation,
    };
  }

  /**
   * Sanitiza los timeDimensions generados por el LLM para evitar fechas inválidas
   * que causan errores de PostgreSQL ("invalid input syntax for type timestamp").
   */
  private sanitizeTimeDimensions(timeDimensions: CubeTimeDimension[]): any[] {
    const validPredefinedRanges = new Set([
      'today', 'yesterday', 'this week', 'last week', 'this month', 'last month',
      'this quarter', 'last quarter', 'this year', 'last year',
      'last 7 days', 'last 30 days', 'last 90 days', 'last 365 days',
    ]);

    const isValidDateString = (val: string): boolean => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const d = new Date(val + 'T00:00:00Z');
        return !isNaN(d.getTime());
      }
      if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
        const d = new Date(val);
        return !isNaN(d.getTime());
      }
      return false;
    };

    return timeDimensions
      .map((td: any) => {
        if (!td.dimension) return null;

        if (!td.dateRange) return td;

        if (typeof td.dateRange === 'string') {
          const normalized = td.dateRange.toLowerCase().trim();
          if (validPredefinedRanges.has(normalized)) {
            return { ...td, dateRange: td.dateRange };
          }
          if (normalized.includes('este mes') || normalized.includes('mes actual')) {
            return { ...td, dateRange: 'This month' };
          }
          if (normalized.includes('mes pasado') || normalized.includes('último mes') || normalized.includes('ultimo mes')) {
            return { ...td, dateRange: 'Last month' };
          }
          if (normalized.includes('este año') || normalized.includes('año actual') || normalized.includes('este ano')) {
            return { ...td, dateRange: 'This year' };
          }
          if (normalized.includes('año pasado') || normalized.includes('último año') || normalized.includes('ano pasado')) {
            return { ...td, dateRange: 'Last year' };
          }
          if (normalized.includes('esta semana') || normalized.includes('semana actual')) {
            return { ...td, dateRange: 'This week' };
          }
          if (normalized.includes('semana pasada') || normalized.includes('última semana')) {
            return { ...td, dateRange: 'Last week' };
          }
          if (normalized === 'hoy' || normalized === 'today') {
            return { ...td, dateRange: 'Today' };
          }
          if (normalized === 'ayer' || normalized === 'yesterday') {
            return { ...td, dateRange: 'Yesterday' };
          }
          if (isValidDateString(td.dateRange)) {
            return { ...td, dateRange: [td.dateRange, td.dateRange] };
          }

          this.logger.warn(`[Cube Executor - Sanitize] dateRange inválido removido: "${td.dateRange}"`);
          const { dateRange, ...rest } = td;
          return Object.keys(rest).length > 1 ? rest : null;
        }

        if (Array.isArray(td.dateRange)) {
          const validDates = td.dateRange.filter((v: any) => typeof v === 'string' && isValidDateString(v));
          if (validDates.length === 2) {
            return { ...td, dateRange: validDates };
          }
          if (validDates.length === 1) {
            return { ...td, dateRange: [validDates[0], validDates[0]] };
          }
          this.logger.warn(`[Cube Executor - Sanitize] dateRange array inválido removido: ${JSON.stringify(td.dateRange)}`);
          const { dateRange, ...rest } = td;
          return Object.keys(rest).length > 1 ? rest : null;
        }

        this.logger.warn(`[Cube Executor - Sanitize] dateRange tipo desconocido removido: ${JSON.stringify(td.dateRange)}`);
        const { dateRange, ...rest } = td;
        return Object.keys(rest).length > 1 ? rest : null;
      })
      .filter(Boolean);
  }

  /**
   * Normaliza y sanitiza operadores de filtros de Cube.dev (ej. 'null' -> 'notSet', 'not_null' -> 'set').
   */
  private sanitizeQueryFilters(filters: any[]): any[] {
    if (!filters || !Array.isArray(filters)) return [];

    const OPERATOR_MAP: Record<string, string> = {
      'null': 'notSet',
      'is_null': 'notSet',
      'isnull': 'notSet',
      'is null': 'notSet',
      'not_null': 'set',
      'notnull': 'set',
      'is_not_null': 'set',
      'is not null': 'set',
      'like': 'contains',
      'ilike': 'contains',
      '=': 'equals',
      '==': 'equals',
      '!=': 'notEquals',
      '<>': 'notEquals',
      'equals': 'equals',
      'notequals': 'notEquals',
      'not_equals': 'notEquals',
      'contains': 'contains',
      'notcontains': 'notContains',
      'not_contains': 'notContains',
      'gt': 'gt',
      'gte': 'gte',
      'lt': 'lt',
      'lte': 'lte',
      'set': 'set',
      'notset': 'notSet',
      'not_set': 'notSet',
      'indaterange': 'inDateRange',
      'in_date_range': 'inDateRange',
      'beforedate': 'beforeDate',
      'before_date': 'beforeDate',
      'afterdate': 'afterDate',
      'after_date': 'afterDate',
    };

    const sanitized: any[] = [];

    for (const f of filters) {
      if (!f) continue;

      if (f.or && Array.isArray(f.or)) {
        const sanitizedOr = this.sanitizeQueryFilters(f.or);
        if (sanitizedOr.length > 0) {
          sanitized.push({ or: sanitizedOr });
        }
        continue;
      }
      if (f.and && Array.isArray(f.and)) {
        const sanitizedAnd = this.sanitizeQueryFilters(f.and);
        if (sanitizedAnd.length > 0) {
          sanitized.push({ and: sanitizedAnd });
        }
        continue;
      }

      if (!f.member) continue;

      const rawOp = String(f.operator || 'equals').trim().toLowerCase().replace(/[\s_-]/g, '');
      const op = OPERATOR_MAP[rawOp] || 'equals';

      if (op === 'set' || op === 'notSet') {
        sanitized.push({
          member: f.member,
          operator: op,
          values: [],
        });
      } else {
        const vals = Array.isArray(f.values) ? f.values : (f.values !== undefined ? [f.values] : []);
        sanitized.push({
          member: f.member,
          operator: op,
          values: vals,
        });
      }
    }

    return sanitized;
  }
}
