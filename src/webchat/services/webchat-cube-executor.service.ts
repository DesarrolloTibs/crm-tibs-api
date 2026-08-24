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
      const orderFormatted = this.sanitizeOrder(cubeQuery.order);

      const queryPayload: any = {};
      if (cubeQuery.measures && cubeQuery.measures.length > 0) {
        queryPayload.measures = cubeQuery.measures;
      }
      if (cubeQuery.dimensions && cubeQuery.dimensions.length > 0) {
        let dims = [...cubeQuery.dimensions];

        // Detectar si la consulta incluye campos descriptivos de elementos individuales (listado/agenda/detalle)
        const hasDescriptiveItemDimensions = dims.some((d: string) => {
          if (typeof d !== 'string') return false;
          const lower = d.toLowerCase();
          return (
            lower.includes('.actividad') ||
            lower.includes('.nombreproyecto') ||
            lower.includes('.descripcion') ||
            lower.includes('.titulo') ||
            lower.includes('.ticketnumber') ||
            lower.includes('.folio') ||
            lower.includes('.concepto') ||
            lower.includes('.fecha') ||
            lower.includes('.createdat')
          );
        });

        // Una consulta es de detalle si no tiene measures, O si tiene campos descriptivos de registros individuales
        const isDetailQuery = (!cubeQuery.measures || cubeQuery.measures.length === 0) || hasDescriptiveItemDimensions;

        // Si es una consulta de detalle y measures solo traía conteos simples (ej. Actividades.count),
        // removemos el count de measures para evitar que Cube.dev agrupe y colapse filas con mismos valores
        if (isDetailQuery && queryPayload.measures && queryPayload.measures.length > 0) {
          const nonCountMeasures = queryPayload.measures.filter(
            (m: string) => typeof m === 'string' && !m.toLowerCase().endsWith('.count') && m.toLowerCase() !== 'count'
          );
          if (nonCountMeasures.length === 0) {
            delete queryPayload.measures;
          } else {
            queryPayload.measures = nonCountMeasures;
          }
        }

        // En consultas de detalle, asegurar que el primary key del cubo principal esté en dimensions
        // para garantizar que cada registro (incluso con el mismo nombre/fecha) sea una fila independiente
        if (isDetailQuery) {
          const primaryCube = dims.find(d => typeof d === 'string' && d.includes('.'))?.split('.')[0];
          if (primaryCube) {
            const primaryIdDim = `${primaryCube}.id`;
            if (!dims.includes(primaryIdDim)) {
              dims.unshift(primaryIdDim);
            }
          }
        }

        // En consultas de detalle permitimos <Cubo>.id para mantener unicidad.
        // En consultas de agregación pura (con measures y sin dimensiones descriptivas), excluimos primary keys para permitir el agrupamiento correcto.
        const filteredDims = dims.filter((d: string) => {
          if (typeof d !== 'string') return false;
          if (isDetailQuery) return true;
          return !d.toLowerCase().endsWith('.id') && d.toLowerCase() !== 'id';
        });

        // Asegurar que cualquier dimensión utilizada en la cláusula 'order' esté presente en dimensions
        // para evitar el error de Cube/Postgres: "ORDER BY position N is not in select list"
        if (orderFormatted) {
          for (const [orderMember] of orderFormatted) {
            if (
              typeof orderMember === 'string' &&
              orderMember.includes('.') &&
              !filteredDims.includes(orderMember) &&
              (!queryPayload.measures || !queryPayload.measures.includes(orderMember))
            ) {
              filteredDims.push(orderMember);
            }
          }
        }

        if (filteredDims.length > 0) {
          queryPayload.dimensions = filteredDims;
        }
      }
      const timezone = process.env.CUBE_TIMEZONE || 'America/Mexico_City';

      if (cubeQuery.filters && cubeQuery.filters.length > 0) {
        const sanitizedFilters = this.sanitizeQueryFilters(cubeQuery.filters, timezone);
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
        const sanitizedTimeDimensions = this.sanitizeTimeDimensions(cubeQuery.timeDimensions, timezone);
        if (sanitizedTimeDimensions.length > 0) {
          queryPayload.timeDimensions = sanitizedTimeDimensions;
        }
      }

      queryPayload.timezone = timezone;

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
   * Sanitiza y valida la cláusula de ordenamiento (order) para Cube.dev.
   * Corrige miembros con sintaxis inválida (ej. "Empresas.nombre.length" -> "Empresas.nombre")
   * y descarta claves que no cumplan el patrón de identificador de Cube (/^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$|^[a-zA-Z0-9_]+$/).
   */
  private sanitizeOrder(order: any): Array<[string, 'asc' | 'desc']> | undefined {
    if (!order) return undefined;

    let entries: Array<[string, any]> = [];

    if (Array.isArray(order)) {
      for (const item of order) {
        if (Array.isArray(item) && item.length >= 2) {
          entries.push([item[0], item[1]]);
        } else if (Array.isArray(item) && item.length === 1) {
          entries.push([item[0], 'asc']);
        } else if (typeof item === 'string') {
          entries.push([item, 'asc']);
        } else if (typeof item === 'object' && item !== null) {
          if (item.id) {
            entries.push([item.id, item.desc ? 'desc' : 'asc']);
          } else {
            entries.push(...Object.entries(item));
          }
        }
      }
    } else if (typeof order === 'object' && order !== null) {
      entries = Object.entries(order);
    }

    const validPattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$|^[a-zA-Z0-9_]+$/;
    const sanitized: Array<[string, 'asc' | 'desc']> = [];

    for (const [key, dir] of entries) {
      if (typeof key !== 'string') continue;

      let member = key.trim();
      // Si contiene más de un punto (ej: "Empresas.nombre.length" o "Oportunidades.monto.raw"), corregir a Cubo.campo
      if (!validPattern.test(member)) {
        const parts = member.split('.').filter(Boolean);
        if (parts.length >= 2) {
          member = `${parts[0]}.${parts[1]}`;
        }
      }

      if (validPattern.test(member)) {
        const direction = String(dir).toLowerCase().trim() === 'desc' ? 'desc' : 'asc';
        sanitized.push([member, direction]);
      } else {
        this.logger.warn(`[Cube Executor - Sanitize] Cláusula order inválida descartada: "${key}"`);
      }
    }

    return sanitized.length > 0 ? sanitized : undefined;
  }

  /**
   * Sanitiza los timeDimensions generados por el LLM para soportar rangos estándar de Cube.dev,
   * términos relativos naturales en español/inglés (hoy, ayer, mañana, pasado mañana, dentro de N días, próxima semana, etc.)
   * y fechas exactas o intervalos.
   */
  private sanitizeTimeDimensions(timeDimensions: CubeTimeDimension[], timezone: string = 'America/Mexico_City'): any[] {
    if (!timeDimensions || !Array.isArray(timeDimensions)) return [];

    return timeDimensions
      .map((td: any) => {
        if (!td || !td.dimension) return null;

        if (!td.dateRange) return td;

        const resolved = this.resolveDateRange(td.dateRange, timezone);
        if (resolved) {
          return { ...td, dateRange: resolved };
        }

        this.logger.warn(`[Cube Executor - Sanitize] dateRange no reconocido/inválido removido: ${JSON.stringify(td.dateRange)}`);
        const { dateRange, ...rest } = td;
        return Object.keys(rest).length > 1 ? rest : null;
      })
      .filter(Boolean);
  }

  /**
   * Resuelve cualquier expresión de rango de fecha (natural o formateada) a un dateRange válido para Cube.dev.
   * Retorna una tupla [fechaInicio, fechaFin] en formato 'YYYY-MM-DD', o un string estándar ('Today', 'Yesterday', 'This week', etc.).
   */
  public resolveDateRange(rawDateRange: any, timezone: string = 'America/Mexico_City'): string | [string, string] | null {
    if (!rawDateRange) return null;

    const { year, month, dayOfWeek, dateStr, pad } = this.getNowInTimezone(timezone);

    // Si viene como arreglo: [start, end]
    if (Array.isArray(rawDateRange)) {
      if (rawDateRange.length === 2) {
        const s = this.parseSingleDate(rawDateRange[0], year) || this.resolveSingleRelativeDay(rawDateRange[0], dateStr);
        const e = this.parseSingleDate(rawDateRange[1], year) || this.resolveSingleRelativeDay(rawDateRange[1], dateStr);
        if (s && e) return [s, e];
        if (s) return [s, s];
      } else if (rawDateRange.length === 1) {
        const s = this.parseSingleDate(rawDateRange[0], year) || this.resolveSingleRelativeDay(rawDateRange[0], dateStr);
        if (s) return [s, s];
      }
      return null;
    }

    if (typeof rawDateRange !== 'string') return null;

    const normalized = rawDateRange.toLowerCase().trim().replace(/[_\s]+/g, ' ');

    // 1. Rangos estándar predefinidos soportados nativamente por Cube.dev
    const standardPredefined: Record<string, string> = {
      'today': 'Today',
      'yesterday': 'Yesterday',
      'this week': 'This week',
      'last week': 'Last week',
      'this month': 'This month',
      'last month': 'Last month',
      'this quarter': 'This quarter',
      'last quarter': 'Last quarter',
      'this year': 'This year',
      'last year': 'Last year',
      'last 7 days': 'last 7 days',
      'last 30 days': 'last 30 days',
      'last 90 days': 'last 90 days',
      'last 365 days': 'last 365 days',
    };

    if (standardPredefined[normalized]) {
      return standardPredefined[normalized];
    }

    // 2. Días relativos específicos
    if (normalized === 'hoy' || normalized === 'el dia de hoy' || normalized === 'el día de hoy' || normalized === 'de hoy') {
      return 'Today';
    }
    if (normalized === 'ayer' || normalized === 'el dia de ayer' || normalized === 'el día de ayer' || normalized === 'de ayer') {
      return 'Yesterday';
    }
    if (
      normalized === 'mañana' ||
      normalized === 'manana' ||
      normalized === 'tomorrow' ||
      normalized === 'el dia de mañana' ||
      normalized === 'el día de mañana' ||
      normalized === 'el dia de manana' ||
      normalized === 'de mañana' ||
      normalized === 'para mañana' ||
      normalized === 'para manana'
    ) {
      const tomorrow = this.addDays(dateStr, 1);
      return [tomorrow, tomorrow];
    }
    if (
      normalized === 'pasado mañana' ||
      normalized === 'pasado manana' ||
      normalized === 'pasadomañana' ||
      normalized === 'pasadomanana' ||
      normalized === 'day after tomorrow' ||
      normalized === 'the day after tomorrow' ||
      normalized === 'para pasado mañana'
    ) {
      const dayAfter = this.addDays(dateStr, 2);
      return [dayAfter, dayAfter];
    }
    if (
      normalized === 'antier' ||
      normalized === 'anteayer' ||
      normalized === 'ante ayer' ||
      normalized === 'antier pasado' ||
      normalized === 'day before yesterday' ||
      normalized === 'the day before yesterday'
    ) {
      const dayBefore = this.addDays(dateStr, -2);
      return [dayBefore, dayBefore];
    }

    // 3. Días de la semana específicos:
    // 3.1 "el [día] de hace N semanas" (ej: "el lunes de hace 2 semanas", "el miércoles de hace dos semanas", "el viernes de hace 3 semanas")
    const dayNWeeksAgoMatch = normalized.match(
      /^(?:el\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:de\s+)?hace\s+([a-záéíóú0-9]+)\s+semanas?$/i
    );
    if (dayNWeeksAgoMatch) {
      const targetDay = this.parseDayOfWeek(dayNWeeksAgoMatch[1]);
      const n = this.parseNumberOrWord(dayNWeeksAgoMatch[2]);
      if (targetDay !== null && n !== null) {
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        const thisMonday = this.addDays(dateStr, -daysSinceMonday);
        const targetMonday = this.addDays(thisMonday, -(n * 7));
        const offset = targetDay === 0 ? 6 : targetDay - 1;
        const targetDate = this.addDays(targetMonday, offset);
        return [targetDate, targetDate];
      }
    }

    // 3.2 "el [día] pasado", "el pasado [día]", "el [día] anterior", "[día] de la semana pasada"
    const pastDayMatch = normalized.match(
      /^(?:el\s+)?(?:pasado\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:pasado|anterior|de\s+la\s+semana\s+pasada|last))?$/i
    );
    if (pastDayMatch && (normalized.includes('pasad') || normalized.includes('anterior') || normalized.includes('semana pasada') || normalized.includes('last'))) {
      const targetDay = this.parseDayOfWeek(pastDayMatch[1]);
      if (targetDay !== null) {
        if (normalized.includes('semana pasada')) {
          const daysSinceMonday = (dayOfWeek + 6) % 7;
          const thisMonday = this.addDays(dateStr, -daysSinceMonday);
          const lastMonday = this.addDays(thisMonday, -7);
          const offset = targetDay === 0 ? 6 : targetDay - 1;
          const targetDate = this.addDays(lastMonday, offset);
          return [targetDate, targetDate];
        } else {
          let diff = dayOfWeek - targetDay;
          if (diff <= 0) diff += 7;
          const targetDate = this.addDays(dateStr, -diff);
          return [targetDate, targetDate];
        }
      }
    }

    // 3.3 "este [día]", "el [día] de esta semana", "el [día]"
    const currentWeekDayMatch = normalized.match(
      /^(?:este\s+|el\s+)(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\s+de\s+esta\s+semana)?$/i
    );
    if (currentWeekDayMatch) {
      const targetDay = this.parseDayOfWeek(currentWeekDayMatch[1]);
      if (targetDay !== null) {
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        const thisMonday = this.addDays(dateStr, -daysSinceMonday);
        const offset = targetDay === 0 ? 6 : targetDay - 1;
        const targetDate = this.addDays(thisMonday, offset);
        return [targetDate, targetDate];
      }
    }

    // 3.4 "el próximo [día]", "el [día] que entra", "el [día] que viene"
    const nextWeekDayMatch = normalized.match(
      /^(?:el\s+)?(?:pr[oó]ximo\s+|siguiente\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\s+(?:que\s+entra|que\s+viene|pr[oó]ximo|siguiente))$/i
    );
    if (nextWeekDayMatch) {
      const targetDay = this.parseDayOfWeek(nextWeekDayMatch[1]);
      if (targetDay !== null) {
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        const thisMonday = this.addDays(dateStr, -daysSinceMonday);
        const nextMonday = this.addDays(thisMonday, 7);
        const offset = targetDay === 0 ? 6 : targetDay - 1;
        const targetDate = this.addDays(nextMonday, offset);
        return [targetDate, targetDate];
      }
    }

    // 4. Expresiones dinámicas de días en el pasado (ej: "hace 2 días", "hace dos días", "hace 3 días", "3 days ago", "-2 days")
    const nDaysAgoMatch = normalized.match(/^(?:hace|-)\s*([a-záéíóú0-9]+)\s*(?:d[ií]as?|days?)(?:\s*ago)?$/i) ||
                          normalized.match(/^([a-záéíóú0-9]+)\s*(?:d[ií]as?|days?)\s*ago$/i);
    if (nDaysAgoMatch) {
      const n = this.parseNumberOrWord(nDaysAgoMatch[1]);
      if (n !== null) {
        const targetDate = this.addDays(dateStr, -n);
        return [targetDate, targetDate];
      }
    }

    // 5. Expresiones dinámicas de días en el futuro (ej: "dentro de 2 días", "en dos días", "en 3 días", "in 5 days", "+3 days")
    const inNDaysMatch = normalized.match(/^(?:dentro\s+de|en|\+)\s*([a-záéíóú0-9]+)\s*(?:d[ií]as?|days?)$/i);
    if (inNDaysMatch) {
      const n = this.parseNumberOrWord(inNDaysMatch[1]);
      if (n !== null) {
        const targetDate = this.addDays(dateStr, n);
        return [targetDate, targetDate];
      }
    }

    // 6. Semanas dinámicas en el pasado:
    // 6.1 "la semana de hace N semanas" (lunes a domingo de hace N semanas)
    const weekOfNWeeksAgoMatch = normalized.match(/^(?:la\s+)?semana\s+(?:de\s+)?hace\s+([a-záéíóú0-9]+)\s+semanas?$/i);
    if (weekOfNWeeksAgoMatch) {
      const n = this.parseNumberOrWord(weekOfNWeeksAgoMatch[1]);
      if (n !== null) {
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        const thisMonday = this.addDays(dateStr, -daysSinceMonday);
        const targetMonday = this.addDays(thisMonday, -(n * 7));
        const targetSunday = this.addDays(targetMonday, 6);
        return [targetMonday, targetSunday];
      }
    }

    // 6.2 "hace N semanas" (ej: "hace 2 semanas", "hace dos semanas", "hace una semana")
    const nWeeksAgoMatch = normalized.match(/^(?:hace|-)\s*([a-záéíóú0-9]+)\s*semanas?(?:\s*ago)?$/i) ||
                           normalized.match(/^([a-záéíóú0-9]+)\s*weeks?\s*ago$/i);
    if (nWeeksAgoMatch) {
      const n = this.parseNumberOrWord(nWeeksAgoMatch[1]);
      if (n !== null) {
        const targetDate = this.addDays(dateStr, -(n * 7));
        return [targetDate, targetDate];
      }
    }

    // 7. Meses dinámicos en el pasado:
    // 7.1 "el mes de hace N meses" (mes calendario completo)
    const monthOfNMonthsAgoMatch = normalized.match(/^(?:el\s+)?mes\s+(?:de\s+)?hace\s+([a-záéíóú0-9]+)\s+mes(?:es)?$/i);
    if (monthOfNMonthsAgoMatch) {
      const n = this.parseNumberOrWord(monthOfNMonthsAgoMatch[1]);
      if (n !== null) {
        const targetDate = this.addMonths(dateStr, -n);
        const [y, m] = targetDate.split('-').map(Number);
        const monthStart = `${y}-${pad(m)}-01`;
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const monthEnd = `${y}-${pad(m)}-${pad(lastDay)}`;
        return [monthStart, monthEnd];
      }
    }

    // 7.2 "hace N meses" (ej: "hace un mes", "hace dos meses", "hace 3 meses")
    const nMonthsAgoMatch = normalized.match(/^(?:hace|-)\s*([a-záéíóú0-9]+)\s*mes(?:es)?(?:\s*ago)?$/i) ||
                            normalized.match(/^([a-záéíóú0-9]+)\s*months?\s*ago$/i);
    if (nMonthsAgoMatch) {
      const n = this.parseNumberOrWord(nMonthsAgoMatch[1]);
      if (n !== null) {
        const targetDate = this.addMonths(dateStr, -n);
        return [targetDate, targetDate];
      }
    }

    // 8. Años dinámicos en el pasado: "hace N años" (ej: "hace un año", "hace 2 años", "hace dos años")
    const nYearsAgoMatch = normalized.match(/^(?:hace|-)\s*([a-záéíóú0-9]+)\s*a[ñn]os?(?:\s*ago)?$/i) ||
                           normalized.match(/^([a-záéíóú0-9]+)\s*years?\s*ago$/i);
    if (nYearsAgoMatch) {
      const n = this.parseNumberOrWord(nYearsAgoMatch[1]);
      if (n !== null) {
        const targetDate = this.addYears(dateStr, -n);
        return [targetDate, targetDate];
      }
    }

    // 9. Rango de próximos N días (ej: "próximos 7 días", "siguientes 3 días", "next 7 days")
    const nextNDaysMatch = normalized.match(/^(?:pr[oó]ximos?|siguientes?|next)\s*([a-záéíóú0-9]+)\s*(?:d[ií]as?|days?)$/i);
    if (nextNDaysMatch) {
      const n = this.parseNumberOrWord(nextNDaysMatch[1]);
      if (n !== null) {
        return [dateStr, this.addDays(dateStr, n)];
      }
    }

    // 10. Rango de últimos N días (ej: "últimos 5 días", "pasados 10 días", "last 14 days")
    const lastNDaysMatch = normalized.match(/^(?:[uú]ltimos?|pasados?|last)\s*([a-záéíóú0-9]+)\s*(?:d[ií]as?|days?)$/i);
    if (lastNDaysMatch) {
      const n = this.parseNumberOrWord(lastNDaysMatch[1]);
      if (n !== null) {
        if ([7, 30, 90, 365].includes(n)) {
          return `last ${n} days`;
        }
        return [this.addDays(dateStr, -n), dateStr];
      }
    }

    // 11. Semanas estándar
    if (
      normalized.includes('esta semana') ||
      normalized.includes('semana actual') ||
      normalized === 'la semana' ||
      normalized === 'this week'
    ) {
      return 'This week';
    }
    if (
      normalized.includes('semana pasada') ||
      normalized.includes('última semana') ||
      normalized.includes('ultima semana') ||
      normalized.includes('semana anterior') ||
      normalized === 'last week'
    ) {
      return 'Last week';
    }
    if (
      normalized.includes('próxima semana') ||
      normalized.includes('proxima semana') ||
      normalized.includes('siguiente semana') ||
      normalized.includes('semana que entra') ||
      normalized.includes('semana que viene') ||
      normalized === 'next week'
    ) {
      const daysUntilNextMonday = ((8 - dayOfWeek) % 7) || 7;
      const nextMonday = this.addDays(dateStr, daysUntilNextMonday);
      const nextSunday = this.addDays(nextMonday, 6);
      return [nextMonday, nextSunday];
    }

    // 12. Meses estándar
    if (
      normalized.includes('este mes') ||
      normalized.includes('mes actual') ||
      normalized === 'el mes' ||
      normalized === 'this month'
    ) {
      return 'This month';
    }
    if (
      normalized.includes('mes pasado') ||
      normalized.includes('último mes') ||
      normalized.includes('ultimo mes') ||
      normalized.includes('mes anterior') ||
      normalized === 'last month'
    ) {
      return 'Last month';
    }
    if (
      normalized.includes('próximo mes') ||
      normalized.includes('proximo mes') ||
      normalized.includes('siguiente mes') ||
      normalized.includes('mes que entra') ||
      normalized.includes('mes que viene') ||
      normalized === 'next month'
    ) {
      const nextMonthYear = month === 12 ? year + 1 : year;
      const nextMonthNum = month === 12 ? 1 : month + 1;
      const nextMonthStart = `${nextMonthYear}-${pad(nextMonthNum)}-01`;
      const lastDayNextMonth = new Date(Date.UTC(nextMonthYear, nextMonthNum, 0)).getUTCDate();
      const nextMonthEnd = `${nextMonthYear}-${pad(nextMonthNum)}-${pad(lastDayNextMonth)}`;
      return [nextMonthStart, nextMonthEnd];
    }

    // 13. Años estándar
    if (
      normalized.includes('este año') ||
      normalized.includes('año actual') ||
      normalized.includes('este ano') ||
      normalized === 'this year'
    ) {
      return 'This year';
    }
    if (
      normalized.includes('año pasado') ||
      normalized.includes('último año') ||
      normalized.includes('ultimo año') ||
      normalized.includes('ano pasado') ||
      normalized.includes('año anterior') ||
      normalized === 'last year'
    ) {
      return 'Last year';
    }
    if (
      normalized.includes('próximo año') ||
      normalized.includes('proximo año') ||
      normalized.includes('siguiente año') ||
      normalized.includes('proximo ano') ||
      normalized.includes('año que entra') ||
      normalized.includes('año que viene') ||
      normalized === 'next year'
    ) {
      return [`${year + 1}-01-01`, `${year + 1}-12-31`];
    }

    // 14. Fechas exactas individuales o textuales (ej: "2026-08-25", "25/08/2026", "25 de agosto")
    const parsedSingle = this.parseSingleDate(normalized, year);
    if (parsedSingle) {
      return [parsedSingle, parsedSingle];
    }

    return null;
  }

  /**
   * Parsea un número en formato numérico ('2') o como palabra en español/inglés ('dos', 'tres', 'two').
   */
  private parseNumberOrWord(val: string): number | null {
    if (!val) return null;
    const trimmed = val.trim().toLowerCase();
    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) return num;

    const SPANISH_NUMBERS: Record<string, number> = {
      un: 1, uno: 1, una: 1,
      dos: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
      seis: 6,
      siete: 7,
      ocho: 8,
      nueve: 9,
      diez: 10,
      once: 11,
      doce: 12,
      quince: 15,
      veinte: 20,
      veinticinco: 25,
      treinta: 30,
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    };
    return SPANISH_NUMBERS[trimmed] ?? null;
  }

  /**
   * Parsea el nombre de un día de la semana a su índice numérico (0=Domingo, 1=Lunes, ..., 6=Sábado).
   */
  private parseDayOfWeek(val: string): number | null {
    if (!val) return null;
    const s = val.toLowerCase().trim();
    if (/^domingo$|^sunday$/i.test(s)) return 0;
    if (/^lunes$|^monday$/i.test(s)) return 1;
    if (/^martes$|^tuesday$/i.test(s)) return 2;
    if (/^mi[eé]rcoles$|^wednesday$/i.test(s)) return 3;
    if (/^jueves$|^thursday$/i.test(s)) return 4;
    if (/^viernes$|^friday$/i.test(s)) return 5;
    if (/^s[aá]bado$|^saturday$/i.test(s)) return 6;
    return null;
  }

  /**
   * Suma o resta meses a una fecha base en formato YYYY-MM-DD.
   */
  private addMonths(baseDateStr: string, monthsToAdd: number): string {
    const [y, m, d] = baseDateStr.split('-').map(Number);
    const totalMonths = y * 12 + (m - 1) + monthsToAdd;
    const newYear = Math.floor(totalMonths / 12);
    const newMonth = ((totalMonths % 12) + 12) % 12 + 1;
    const daysInNewMonth = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate();
    const newDay = Math.min(d, daysInNewMonth);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${newYear}-${pad(newMonth)}-${pad(newDay)}`;
  }

  /**
   * Suma o resta años a una fecha base en formato YYYY-MM-DD.
   */
  private addYears(baseDateStr: string, yearsToAdd: number): string {
    const [y, m, d] = baseDateStr.split('-').map(Number);
    const newYear = y + yearsToAdd;
    const daysInNewMonth = new Date(Date.UTC(newYear, m, 0)).getUTCDate();
    const newDay = Math.min(d, daysInNewMonth);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${newYear}-${pad(m)}-${pad(newDay)}`;
  }

  /**
   * Extrae la fecha actual y sus partes en la zona horaria indicada.
   */
  private getNowInTimezone(timezone: string = 'America/Mexico_City') {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    let day = new Date().getDate();

    for (const p of parts) {
      if (p.type === 'year') year = parseInt(p.value, 10);
      if (p.type === 'month') month = parseInt(p.value, 10);
      if (p.type === 'day') day = parseInt(p.value, 10);
    }

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

    return { year, month, day, dayOfWeek, dateStr, pad };
  }

  /**
   * Suma o resta días a una fecha base en formato YYYY-MM-DD.
   */
  private addDays(baseDateStr: string, days: number): string {
    const [y, m, d] = baseDateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    const year = dt.getUTCFullYear();
    const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Resuelve un término relativo simple de un solo día (hoy, ayer, mañana, pasado mañana).
   */
  private resolveSingleRelativeDay(val: any, baseDateStr: string): string | null {
    if (typeof val !== 'string') return null;
    const lower = val.toLowerCase().trim();
    if (lower === 'hoy' || lower === 'today') return baseDateStr;
    if (lower === 'ayer' || lower === 'yesterday') return this.addDays(baseDateStr, -1);
    if (lower === 'mañana' || lower === 'manana' || lower === 'tomorrow') return this.addDays(baseDateStr, 1);
    if (lower === 'pasado mañana' || lower === 'pasado manana' || lower === 'day after tomorrow') return this.addDays(baseDateStr, 2);
    if (lower === 'antier' || lower === 'anteayer' || lower === 'day before yesterday') return this.addDays(baseDateStr, -2);
    return null;
  }

  /**
   * Parsea un string individual de fecha en diversos formatos (ISO, DD/MM/YYYY, textual en español) a 'YYYY-MM-DD'.
   */
  private parseSingleDate(val: string, currentYear: number): string | null {
    if (typeof val !== 'string') return null;
    const str = val.trim();

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const d = new Date(str + 'T00:00:00Z');
      return isNaN(d.getTime()) ? null : str;
    }

    // YYYY-MM-DDTHH:mm:ss...
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return str.split('T')[0];
      }
    }

    // DD/MM/YYYY o DD-MM-YYYY
    const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyyMatch) {
      const d = ddmmyyyyMatch[1].padStart(2, '0');
      const m = ddmmyyyyMatch[2].padStart(2, '0');
      const y = ddmmyyyyMatch[3];
      return `${y}-${m}-${d}`;
    }

    // YYYY/MM/DD
    const yyyymmddMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (yyyymmddMatch) {
      const y = yyyymmddMatch[1];
      const m = yyyymmddMatch[2].padStart(2, '0');
      const d = yyyymmddMatch[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // Fecha textual en español: "25 de agosto" o "25 de agosto de 2026"
    const MESES_MAP: Record<string, string> = {
      enero: '01', febrero: '02', marzo: '03', abril: '04',
      mayo: '05', junio: '06', julio: '07', agosto: '08',
      septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12',
    };

    const textMatch = str.toLowerCase().match(/^(\d{1,2})\s+(?:de\s+)?([a-zñ]+)(?:\s+(?:del?\s+)?(\d{4}))?$/);
    if (textMatch) {
      const day = textMatch[1].padStart(2, '0');
      const monthName = textMatch[2];
      const year = textMatch[3] ? parseInt(textMatch[3], 10) : currentYear;
      const month = MESES_MAP[monthName];
      if (month) {
        return `${year}-${month}-${day}`;
      }
    }

    return null;
  }

  /**
   * Normaliza y sanitiza operadores y valores de filtros de Cube.dev (ej. 'null' -> 'notSet', 'not_null' -> 'set',
   * y normaliza filtros de fecha en campos temporales).
   */
  private sanitizeQueryFilters(filters: any[], timezone: string = 'America/Mexico_City'): any[] {
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
        const sanitizedOr = this.sanitizeQueryFilters(f.or, timezone);
        if (sanitizedOr.length > 0) {
          sanitized.push({ or: sanitizedOr });
        }
        continue;
      }
      if (f.and && Array.isArray(f.and)) {
        const sanitizedAnd = this.sanitizeQueryFilters(f.and, timezone);
        if (sanitizedAnd.length > 0) {
          sanitized.push({ and: sanitizedAnd });
        }
        continue;
      }

      if (!f.member) continue;

      let member = String(f.member).trim();
      let vals = Array.isArray(f.values) ? f.values : (f.values !== undefined ? [f.values] : []);
      const lowerMem = member.toLowerCase();

      // Remapear miembros de etapas para basarse ÚNICAMENTE en stageType
      if (
        lowerMem === 'oportunidades.etapa' ||
        lowerMem === 'oportunidades.stage' ||
        lowerMem === 'oportunidades.stagetype' ||
        lowerMem === 'etapas.etapa' ||
        lowerMem === 'etapas.nombre' ||
        lowerMem === 'etapas.stagetype' ||
        lowerMem === 'etapas.type'
      ) {
        const valStr = vals.map((v: any) => String(v).toLowerCase()).join(' ');
        if (
          valStr.includes('ganada') ||
          valStr.includes('ganado') ||
          valStr.includes('venta') ||
          valStr.includes('exitosa') ||
          valStr.includes('exitoso') ||
          valStr === '1'
        ) {
          member = 'Etapas.stageType';
          vals = ['1'];
        } else if (
          valStr.includes('perdida') ||
          valStr.includes('perdido') ||
          valStr === '2'
        ) {
          member = 'Etapas.stageType';
          vals = ['2'];
        } else if (
          valStr.includes('abierta') ||
          valStr.includes('abierto') ||
          valStr.includes('proceso') ||
          valStr === '0'
        ) {
          member = 'Etapas.stageType';
          vals = ['0'];
        } else {
          member = 'Etapas.stageType';
        }
      } else if (
        lowerMem === 'tickets.etapa' ||
        lowerMem === 'tickets.stage' ||
        lowerMem === 'tickets.estado' ||
        lowerMem === 'tickets.stagetype' ||
        lowerMem === 'etapasticket.etapa' ||
        lowerMem === 'etapasticket.nombre' ||
        lowerMem === 'etapasticket.stagetype'
      ) {
        const valStr = vals.map((v: any) => String(v).toLowerCase()).join(' ');
        if (valStr.includes('abierto') || valStr.includes('abierta') || valStr === '0') {
          member = 'EtapasTicket.stageType';
          vals = ['0'];
        } else if (valStr.includes('cerrado') || valStr.includes('cerrada') || valStr.includes('resuelto') || valStr === '1') {
          member = 'EtapasTicket.stageType';
          vals = ['1'];
        } else {
          member = 'EtapasTicket.stageType';
        }
      } else if (lowerMem === 'actividades.tipo' || lowerMem === 'actividades.tipoactividad') {
        member = 'TiposActividad.nombre';
      } else if (lowerMem === 'oportunidades.ejecutivo' || lowerMem === 'clientes.ejecutivo' || lowerMem === 'empresas.ejecutivo') {
        member = 'Usuarios.username';
      } else if (lowerMem === 'oportunidades.empresa' || lowerMem === 'clientes.empresa') {
        member = 'Empresas.nombre';
      }

      const rawOp = String(f.operator || 'equals').trim().toLowerCase().replace(/[\s_-]/g, '');
      let op = OPERATOR_MAP[rawOp] || 'equals';

      // Sanitizar filtros sobre campos de fecha/timestamp
      const isDateField =
        lowerMem.endsWith('.fecha') ||
        lowerMem.endsWith('.createdat') ||
        lowerMem.endsWith('.updatedat') ||
        lowerMem.endsWith('.estimatedclosuredate') ||
        lowerMem.endsWith('.date');

      if (isDateField && vals.length > 0) {
        if (op === 'equals') {
          const resolved = this.resolveDateRange(vals.length === 1 ? vals[0] : vals, timezone);
          if (resolved) {
            op = 'inDateRange';
            vals = Array.isArray(resolved) ? resolved : [resolved];
          }
        } else if (op === 'inDateRange') {
          const resolved = this.resolveDateRange(vals.length === 1 ? vals[0] : vals, timezone);
          if (resolved) {
            vals = Array.isArray(resolved) ? resolved : [resolved];
          }
        } else if (op === 'gte' || op === 'gt' || op === 'lte' || op === 'lt' || op === 'beforeDate' || op === 'afterDate') {
          const { year, dateStr } = this.getNowInTimezone(timezone);
          const singleParsed = this.parseSingleDate(vals[0], year) || this.resolveSingleRelativeDay(vals[0], dateStr);
          if (singleParsed) {
            vals = [singleParsed];
          }
        }
      }

      if (op === 'set' || op === 'notSet') {
        sanitized.push({
          member,
          operator: op,
          values: [],
        });
      } else {
        sanitized.push({
          member,
          operator: op,
          values: vals,
        });
      }
    }

    return sanitized;
  }
}

