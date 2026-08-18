import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgentService } from '../../conversations/ai-agent.service';
import { Stage } from '../../stages/entities/stage.entity';
import { TicketStage } from '../../tickets/entities/ticket-stage.entity';
import {
  CubeQuery,
  CubeQueryPlan,
  DashboardRedirect,
  EntityMatchItem,
} from '../interfaces/webchat.interfaces';

@Injectable()
export class WebchatResponseFormatterService {
  private readonly logger = new Logger('WebchatResponseFormatterService');

  constructor(
    private readonly aiAgentService: AiAgentService,
    @InjectRepository(Stage)
    private readonly stageRepository: Repository<Stage>,
    @InjectRepository(TicketStage)
    private readonly ticketStageRepository: Repository<TicketStage>,
  ) {}

  /**
   * Sanitiza y embellece los datos que se enviarán a la tabla visual del frontend,
   * eliminando IDs técnicos (UUIDs), estatus internos y columnas irrelevantes.
   */
  cleanTableDataForFrontend(data: Record<string, any>[]): Record<string, any>[] {
    if (!data || !Array.isArray(data) || data.length === 0) return [];

    const EXCLUDED_KEY_PATTERNS = [
      /\.id$/i,
      /^id$/i,
      /id$/i, // clienteId, stageId, pipelineId, ejecutivoId, responsableId, helpdeskId, companyId, etc.
      /\.estatus$/i,
      /^estatus$/i,
      /\.status$/i,
      /^status$/i,
      /archived/i,
      /alertsent/i,
      /receipturl/i,
      /password/i,
      /createdat/i,
      /updatedat/i,
      /profileimage/i,
      /stagetype/i,
      /stage_type/i,
    ];

    const isExcluded = (key: string): boolean => {
      const lower = key.trim().toLowerCase();
      return EXCLUDED_KEY_PATTERNS.some(pattern => pattern.test(lower));
    };

    return data.map(row => {
      const cleanRow: Record<string, any> = {};

      for (const [key, val] of Object.entries(row)) {
        if (isExcluded(key)) continue;
        cleanRow[key] = val;
      }

      return cleanRow;
    }).filter(row => Object.keys(row).length > 0);
  }

  /**
   * Formatea los resultados crudos en una respuesta amigable usando el LLM o plantillas directas.
   */
  async formatResults(
    originalQuestion: string,
    cubeData: any[],
    queryPlan: CubeQueryPlan,
  ): Promise<string> {
    if (!cubeData || cubeData.length === 0) {
      return 'No se encontraron resultados para tu consulta. ¿Quieres intentar con otros filtros?';
    }

    // Si hay exactamente 1 resultado y un template con variables interpoladas, usamos formato directo
    if (cubeData.length === 1 && queryPlan.responseTemplate && queryPlan.responseTemplate.includes('{')) {
      return this.simpleFormat(cubeData, queryPlan.responseTemplate);
    }

    const truncatedData = cubeData.slice(0, 20);
    const formatPrompt = `Eres el asistente del CRM. El usuario preguntó: "${originalQuestion}".

[DATOS OBTENIDOS DE LA BASE DE DATOS]
Número de registros: ${truncatedData.length}
Datos:
${JSON.stringify(truncatedData, null, 2)}

[REGLAS ESTRICTAS]
- Responde ÚNICAMENTE con 1 o 2 oraciones en texto plano en español dirigidas al usuario.
- PROHIBIDO generar código de programación (NO generes JavaScript, Python, funciones ni scripts).
- PROHIBIDO usar bloques de código con comillas invertidas.
- Ejemplo de respuesta esperada: "Se encontraron 2 clientes en el top de ventas con un monto acumulado de $300.00 MXN."`;

    try {
      const formatted = await this.aiAgentService.invokeLanguageModel(formatPrompt, 0.3);
      let clean = (formatted || '').trim();

      // Si el LLM generó código o bloques de script, descartar el código y usar el generador inteligente
      if (clean.includes('```') || clean.includes('function ') || clean.includes('const ') || clean.includes('console.log')) {
        this.logger.warn(`[ResponseFormatter] El LLM generó código en lugar de texto plano. Aplicando generador inteligente.`);
        return this.generateSmartSummary(cubeData, originalQuestion, queryPlan);
      }

      // Si el LLM copió prefijos como "Respuesta:" o "Resumen:", extraer la respuesta real
      if (clean.includes('Respuesta:')) {
        clean = clean.split(/Respuesta:/i).pop()!.trim();
      } else if (clean.includes('Resumen:')) {
        clean = clean.split(/Resumen:/i).pop()!.trim();
      }

      clean = clean
        .replace(/^\[(REGLAS|INSTRUCCIONES|REGLAS ADICIONALES)[^\]]*\][\s\S]*?(?=\n\n|\n[A-Z]|$)/i, '')
        .trim();

      return clean || this.generateSmartSummary(cubeData, originalQuestion, queryPlan);
    } catch (err) {
      return this.generateSmartSummary(cubeData, originalQuestion, queryPlan);
    }
  }

  /**
   * Genera un resumen inteligente y natural directamente a partir de los datos numéricos y entidades.
   */
  private generateSmartSummary(cubeData: any[], originalQuestion: string, queryPlan: CubeQueryPlan): string {
    if (!cubeData || cubeData.length === 0) return 'No se encontraron resultados.';

    if (cubeData.length === 1 && queryPlan.responseTemplate) {
      return this.simpleFormat(cubeData, queryPlan.responseTemplate);
    }

    let totalMonto = 0;
    let hasMonto = false;

    for (const row of cubeData) {
      for (const [key, val] of Object.entries(row)) {
        if (key.toLowerCase().includes('monto') || key.toLowerCase().includes('sum') || key.toLowerCase().includes('precio')) {
          const num = typeof val === 'number' ? val : parseFloat(String(val || 0));
          if (!isNaN(num)) {
            totalMonto += num;
            hasMonto = true;
          }
        }
      }
    }

    const count = cubeData.length;
    const isTopQuery = originalQuestion.toLowerCase().includes('top');
    const entityLabel = count === 1 ? 'registro' : 'registros';

    if (hasMonto && totalMonto > 0) {
      const formattedMonto = `$${totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
      if (isTopQuery) {
        return `Se encontraron los ${count} clientes principales con un monto acumulado de ${formattedMonto}.`;
      }
      return `Se encontraron ${count} ${entityLabel} con un monto total de ${formattedMonto}.`;
    }

    return `Se encontraron ${count} ${entityLabel} para tu consulta.`;
  }

  /**
   * Formatea el resumen cuando se realiza una búsqueda multi-entidad (consultas vagas).
   */
  formatMultiEntitySummary(searchTerm: string, matches: EntityMatchItem[]): string {
    if (!matches || matches.length === 0) {
      return `No se encontraron coincidencias para "${searchTerm}" en clientes, usuarios, productos ni oportunidades.`;
    }

    const grouped: Record<string, EntityMatchItem[]> = {};
    for (const item of matches) {
      if (!grouped[item.entityType]) {
        grouped[item.entityType] = [];
      }
      grouped[item.entityType].push(item);
    }

    const sections: string[] = [];
    sections.push(`Se encontraron coincidencias para "${searchTerm}":\n`);

    for (const [entityType, items] of Object.entries(grouped)) {
      sections.push(`${entityType}s (${items.length}):`);
      for (const it of items) {
        const sub = it.subtitle ? ` — ${it.subtitle}` : '';
        sections.push(`• ${it.title}${sub}`);
      }
      sections.push('');
    }

    return sections.join('\n').trim();
  }

  /**
   * Reemplaza automáticamente cualquier UUID de etapa/stage presente en el texto
   * por su nombre legible (ej. "ff4266df-..." -> "Negociación").
   */
  async resolveStageUuidsInText(text: string): Promise<string> {
    if (!text) return text;
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const matches = text.match(uuidRegex);
    if (!matches || matches.length === 0) return text;

    let resolvedText = text;
    for (const uuid of matches) {
      const stage = await this.stageRepository.findOne({ where: { id: uuid } });
      if (stage) {
        resolvedText = resolvedText.replace(new RegExp(uuid, 'g'), `"${stage.strname}"`);
        continue;
      }
      const ticketStage = await this.ticketStageRepository.findOne({ where: { id: uuid } });
      if (ticketStage) {
        resolvedText = resolvedText.replace(new RegExp(uuid, 'g'), `"${ticketStage.strname}"`);
      }
    }
    return resolvedText;
  }

  /**
   * Calcula y enriquece la redirección inteligente al dashboard.
   */
  computeDashboardRedirect(
    queryPlan: CubeQueryPlan,
    executedFilters: any[],
    queriesExecuted: CubeQuery[],
    userId: string,
    userRole: string,
  ): DashboardRedirect | null {
    let dashboardRedirect = queryPlan.dashboardRedirect;

    if (!dashboardRedirect) {
      const allMembers = queriesExecuted.flatMap(q => [
        ...(q.measures || []),
        ...(q.dimensions || []),
      ]);
      const hasTickets = allMembers.some(m => typeof m === 'string' && m.startsWith('Tickets.'));
      const hasCommercial = allMembers.some(
        m =>
          typeof m === 'string' &&
          (m.startsWith('Oportunidades.') || m.startsWith('Actividades.') || m.startsWith('Gastos.')),
      );

      if (hasTickets || hasCommercial) {
        dashboardRedirect = {
          tab: hasTickets ? 'support' : 'commercial',
        };
      }
    }

    if (dashboardRedirect) {
      for (const filter of executedFilters) {
        if (filter.operator === 'equals' && Array.isArray(filter.values) && filter.values.length > 0) {
          const val = filter.values[0];
          const member = filter.member;

          if (
            member === 'Oportunidades.ejecutivoId' ||
            member === 'Actividades.userId' ||
            member === 'Gastos.usuarioId' ||
            member === 'Tickets.responsableId'
          ) {
            if (!dashboardRedirect.executiveId && val) {
              dashboardRedirect.executiveId = val;
            }
          } else if (member === 'Oportunidades.pipelineId') {
            if (!dashboardRedirect.pipelineId && val) {
              dashboardRedirect.pipelineId = val;
            }
          } else if (member === 'Tickets.helpdeskId') {
            if (!dashboardRedirect.helpdeskId && val) {
              dashboardRedirect.helpdeskId = val;
            }
          }
        }
      }

      const isExec = (userRole || '').toLowerCase().trim() === 'executive' || (userRole || '').toLowerCase().trim() === 'ejecutivo';
      if (isExec && !dashboardRedirect.executiveId && userId) {
        dashboardRedirect.executiveId = userId;
      }
    }

    return dashboardRedirect || null;
  }

  /**
   * Elimina duplicados de líneas de respuesta formateadas por el LLM.
   */
  deduplicateResponseLines(text: string): string {
    if (!text) return text;
    const lines = text.split('\n');
    const seen = new Set<string>();
    const resultLines: string[] = [];
    let listIndex = 1;

    for (const line of lines) {
      const isListItem = /^\s*\d+[\.\)\-]\s*/.test(line);
      const cleanLine = line
        .replace(/^\s*\d+[\.\)\-]\s*/, '')
        .replace(/^\s*[\-\*•]\s*/, '')
        .trim()
        .toLowerCase();

      if (cleanLine.length === 0) {
        resultLines.push(line);
        continue;
      }

      if (seen.has(cleanLine)) {
        continue;
      }

      const isHeader = cleanLine.endsWith(':') || cleanLine.includes('aquí tiene') || cleanLine.includes('top');
      if (!isHeader) {
        seen.add(cleanLine);
      }

      if (isListItem && !isHeader) {
        const indent = line.match(/^\s*/)?.[0] || '';
        const separator = line.match(/^\s*\d+([\.\)\-])/)?.[1] || '.';
        const lineContent = line.replace(/^\s*\d+[\.\)\-]\s*/, '');
        resultLines.push(`${indent}${listIndex}${separator} ${lineContent}`);
        listIndex++;
      } else {
        resultLines.push(line);
      }
    }

    return resultLines.join('\n');
  }

  private simpleFormat(data: any[], template?: string): string {
    if (data.length === 0) return 'No se encontraron resultados.';

    if (data.length === 1) {
      const row = data[0];
      if (template) {
        let formatted = template;

        for (const [key, val] of Object.entries(row)) {
          const isMonto = key.toLowerCase().includes('monto') || key.toLowerCase().includes('suma') || key.toLowerCase().includes('sum');
          let displayVal = '';

          if (val === null || val === undefined || val === '') {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('apellido')) {
              displayVal = '';
            } else if (keyLower.includes('username') || keyLower.includes('ejecutivo') || keyLower.includes('responsable')) {
              displayVal = 'Sin asignar';
            } else if (keyLower.includes('nombre') || keyLower.includes('name')) {
              displayVal = 'Sin nombre';
            } else if (isMonto) {
              displayVal = '$0';
            } else if (keyLower.includes('count') || keyLower.includes('sum')) {
              displayVal = '0';
            } else {
              displayVal = 'No especificado';
            }
          } else {
            displayVal = typeof val === 'number'
              ? (isMonto ? `$${val.toLocaleString('es-MX')}` : val.toLocaleString('es-MX'))
              : String(val);
          }

          const placeholder = `{${key}}`;
          formatted = formatted.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), displayVal);

          const cleanKey = key.split('.').pop() || key;
          const cleanPlaceholder = `{${cleanKey}}`;
          formatted = formatted.replace(new RegExp(cleanPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), displayVal);
        }
        return formatted;
      }

      const values = Object.entries(row)
        .map(([key, val]) => {
          const cleanKey = key.split('.').pop() || key;
          const isMonto = key.toLowerCase().includes('monto') || key.toLowerCase().includes('suma') || key.toLowerCase().includes('sum');
          let displayVal = '';

          if (val === null || val === undefined || val === '') {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('apellido')) return '';
            if (keyLower.includes('username') || keyLower.includes('ejecutivo') || keyLower.includes('responsable')) return 'Sin asignar';
            if (keyLower.includes('nombre') || keyLower.includes('name')) return 'Sin nombre';
            if (isMonto) return '$0';
            if (keyLower.includes('count') || keyLower.includes('sum')) return '0';
            return 'No especificado';
          } else {
            displayVal = typeof val === 'number'
              ? (isMonto ? `$${val.toLocaleString('es-MX')}` : val.toLocaleString('es-MX'))
              : String(val);
          }
          return displayVal !== '' ? `${cleanKey}: ${displayVal}` : '';
        })
        .filter(v => v !== '')
        .join(' | ');
      return values;
    }

    const rows = data.map((row, i) => {
      const vals = Object.entries(row)
        .map(([key, val]) => {
          const isMonto = key.toLowerCase().includes('monto') || key.toLowerCase().includes('suma') || key.toLowerCase().includes('sum');
          if (val === null || val === undefined || val === '') {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('apellido')) return '';
            if (keyLower.includes('username') || keyLower.includes('ejecutivo') || keyLower.includes('responsable')) return 'Sin asignar';
            if (keyLower.includes('nombre') || keyLower.includes('name')) return 'Sin nombre';
            if (isMonto) return '$0';
            if (keyLower.includes('count') || keyLower.includes('sum')) return '0';
            return 'No especificado';
          }
          return typeof val === 'number'
            ? (isMonto ? `$${val.toLocaleString('es-MX')}` : val.toLocaleString('es-MX'))
            : String(val);
        })
        .filter(v => v !== '')
        .join(' — ');
      return `${i + 1}. ${vals}`;
    }).join('\n');

    return template ? `${template}\n\n${rows}` : rows;
  }
}
