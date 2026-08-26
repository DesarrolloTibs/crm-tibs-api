import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgentService } from '../../conversations/ai-agent.service';
import { Stage } from '../../stages/entities/stage.entity';
import { TicketStage } from '../../tickets/entities/ticket-stage.entity';
import {
  CubeAnnotation,
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
   * Determina si un campo representa un valor monetario (moneda MXN)
   * consultando primero las anotaciones de metadatos de Cube.dev (format: 'currency')
   * o recurriendo a heurísticas basadas en nombres de campos y medidas.
   */
  isCurrencyField(key: string, annotation?: CubeAnnotation): boolean {
    if (!key) return false;

    // 1. Verificación directa en anotaciones de Cube.dev
    if (annotation) {
      if (annotation.measures && annotation.measures[key]?.format === 'currency') {
        return true;
      }
      if (annotation.dimensions && annotation.dimensions[key]?.format === 'currency') {
        return true;
      }
      const cleanKey = key.split('.').pop() || key;
      if (annotation.measures && annotation.measures[cleanKey]?.format === 'currency') {
        return true;
      }
      if (annotation.dimensions && annotation.dimensions[cleanKey]?.format === 'currency') {
        return true;
      }
    }

    const lower = key.toLowerCase();
    const colName = lower.split('.').pop() || lower;

    // Descartar campos que contienen identificadores técnicos o métricas no monetarias
    if (
      colName === 'id' ||
      colName.endsWith('id') ||
      colName.includes('count') ||
      colName.includes('numero') ||
      colName.includes('cantidad') ||
      colName.includes('folio') ||
      colName.includes('date') ||
      colName.includes('fecha') ||
      colName.includes('status') ||
      colName.includes('estatus') ||
      colName.includes('type') ||
      colName.includes('priority') ||
      colName.includes('ticketnumber')
    ) {
      return false;
    }

    // Patrones monetarios estándar del CRM
    return (
      colName.includes('monto') ||
      colName.includes('precio') ||
      colName.includes('preciobase') ||
      colName.includes('licenciamiento') ||
      colName.includes('servicios') ||
      colName.includes('costo') ||
      colName.includes('ingreso') ||
      colName.includes('gasto') ||
      lower.includes('monto') ||
      lower.includes('precio') ||
      lower.includes('licenciamiento') ||
      lower.includes('servicios') ||
      lower.includes('costo') ||
      lower.includes('ingreso') ||
      lower.includes('gasto')
    );
  }

  /**
   * Formatea un valor numérico como moneda estándar (MXN o USD).
   * Ejemplo: (125000, 'MXN') -> "$125,000.00 MXN", (100, 'USD') -> "$100.00 USD"
   */
  formatCurrency(val: any, currency: string = 'MXN'): string {
    const curr = currency?.toUpperCase() === 'USD' ? 'USD' : 'MXN';
    if (val === null || val === undefined || val === '') return `$0.00 ${curr}`;
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return `$0.00 ${curr}`;

    const formattedNumber = new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);

    return `$${formattedNumber} ${curr}`;
  }

  /**
   * Formatea un timestamp ISO UTC a la zona horaria local de México (ej. 20/01/2023, 12:00 p.m.).
   */
  formatDateTime(val: any, timezone: string = 'America/Mexico_City'): string {
    if (!val) return '';
    try {
      const strVal = String(val).trim();
      const utcStr = strVal.endsWith('Z') || strVal.includes('+') ? strVal : `${strVal}Z`;
      const d = new Date(utcStr);
      if (isNaN(d.getTime())) return strVal;

      return d.toLocaleString('es-MX', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return String(val);
    }
  }

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

    const hasDescriptiveColumns = data.some(row =>
      Object.keys(row).some(k => {
        const lower = k.toLowerCase();
        return (
          lower.includes('nombre') ||
          lower.includes('proyecto') ||
          lower.includes('cuenta') ||
          lower.includes('cliente') ||
          lower.includes('titulo') ||
          lower.includes('folio') ||
          lower.includes('ticketnumber') ||
          lower.includes('actividad') ||
          lower.includes('concepto') ||
          lower.includes('empresa') ||
          lower.includes('correo')
        );
      }),
    );

    const isExcluded = (key: string, row: Record<string, any>): boolean => {
      const lower = key.trim().toLowerCase();
      if (EXCLUDED_KEY_PATTERNS.some(pattern => pattern.test(lower))) {
        return true;
      }
      // Excluir count/conteo si hay columnas descriptivas de registros individuales o vale 1 en todas las filas
      if (lower === 'count' || lower.endsWith('.count') || lower === 'conteo' || lower.endsWith('.conteo')) {
        if (hasDescriptiveColumns || data.every(r => Number(r[key]) === 1 || Number(r[key]) === 0)) {
          return true;
        }
      }
      // Excluir montoTotalMxnSum si ya existe montoTotal en la fila para no duplicar montos
      if (
        (lower === 'montototalmxnsum' || lower.endsWith('.montototalmxnsum')) &&
        (row['Oportunidades.montoTotal'] !== undefined || row['montoTotal'] !== undefined)
      ) {
        return true;
      }
      return false;
    };

    return data.map(row => {
      const cleanRow: Record<string, any> = {};

      for (const [key, val] of Object.entries(row)) {
        const lower = key.trim().toLowerCase();
        if (lower.includes('stagetype') || lower.includes('stage_type')) {
          if (!hasDescriptiveColumns) {
            const isTicket = lower.includes('ticket') || row['Tickets.count'] !== undefined;
            let label = 'Sin etapa definida';
            if (val === 0 || val === '0') label = isTicket ? 'Abierto / Pendiente' : 'Abierta / En Pipeline';
            else if (val === 1 || val === '1') label = isTicket ? 'Cerrado / Resuelto' : 'Ganada / Venta Concretada';
            else if (val === 2 || val === '2') label = 'Perdida / Cancelada';
            cleanRow['Tipo de Etapa'] = label;
          }
          continue;
        }

        if (isExcluded(key, row)) continue;

        // Normalizar fechas UTC agregando 'Z' si viene en formato ISO sin zona horaria
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val) && !val.endsWith('Z') && !val.includes('+')) {
          cleanRow[key] = `${val}Z`;
        } else {
          cleanRow[key] = val;
        }
      }

      return cleanRow;
    }).filter(row => Object.keys(row).length > 0);
  }

  /**
   * Formatea los resultados crudos en una respuesta amigable usando plantillas directas y el generador inteligente (cero tokens extra).
   */
  async formatResults(
    originalQuestion: string,
    cubeData: any[],
    queryPlan: CubeQueryPlan,
    annotation?: CubeAnnotation,
  ): Promise<string> {
    if (!cubeData || cubeData.length === 0) {
      return 'No se encontraron resultados para tu consulta. ¿Quieres intentar con otros filtros?';
    }

    const hasStageType = cubeData.some(row => row['Etapas.stageType'] !== undefined || row['stageType'] !== undefined || row['EtapasTicket.stageType'] !== undefined);
    const hasDescriptive = cubeData.some(row => row['Oportunidades.nombreProyecto'] || row['nombreProyecto'] || row['Tickets.titulo'] || row['titulo']);

    // 0. Si es una agregación por etapa / comparativa, SIEMPRE generar el resumen estructurado y limpio
    if (hasStageType && !hasDescriptive) {
      return this.generateSmartSummary(cubeData, originalQuestion, queryPlan, annotation);
    }

    // 1. Si hay un template con placeholders {campo}, interpolarlo
    if (queryPlan.responseTemplate && queryPlan.responseTemplate.includes('{')) {
      return this.simpleFormat(cubeData, queryPlan.responseTemplate, annotation);
    }

    // 2. Si hay un template que es un encabezado (termina en ':') y hay datos, adjuntar la lista de registros
    if (queryPlan.responseTemplate && queryPlan.responseTemplate.trim().endsWith(':')) {
      const header = queryPlan.responseTemplate.trim();
      const listContent = this.formatDataRowsAsList(cubeData, annotation);
      if (listContent) {
        return `${header}\n\n${listContent}`;
      }
      return header;
    }

    // 3. Generador determinista inteligente con listado adjunto si aplica
    const summary = this.generateSmartSummary(cubeData, originalQuestion, queryPlan, annotation);

    const qLower = (originalQuestion || '').toLowerCase();
    const shouldAttachList = qLower.includes('top') || qLower.includes('lista') || qLower.includes('cuales') || qLower.includes('cuáles') || cubeData.length <= 10;
    if (shouldAttachList) {
      const listContent = this.formatDataRowsAsList(cubeData, annotation);
      if (listContent) {
        return `${summary}\n\n${listContent}`;
      }
    }

    return summary;
  }

  /**
   * Formatea un arreglo de datos de Cube.dev como una lista legible y numerada en markdown.
   */
  formatDataRowsAsList(data: any[], annotation?: CubeAnnotation): string {
    if (!data || !Array.isArray(data) || data.length === 0) return '';

    return data
      .map((row, idx) => {
        const rowCurrency = row['Oportunidades.moneda'] || row['moneda'] || 'MXN';

        // 1. Oportunidades
        const nombreProyecto = row['Oportunidades.nombreProyecto'] || row['nombreProyecto'];
        if (nombreProyecto) {
          const cuenta = row['Oportunidades.cuentaOCliente'] || row['cuentaOCliente'] || row['Empresas.nombre'] || '';
          const cuentaStr = cuenta ? ` (${cuenta})` : '';
          const montoVal = row['Oportunidades.montoTotal'] ?? row['montoTotal'] ?? row['Oportunidades.montoTotalMxnSum'] ?? row['montoTotalMxnSum'];
          const montoStr = montoVal !== undefined && montoVal !== null && montoVal !== '' ? ` — ${this.formatCurrency(montoVal, rowCurrency)}` : '';
          const etapa = row['Etapas.nombre'] || row['etapa'];
          const etapaStr = etapa ? ` [${etapa}]` : '';
          return `${idx + 1}. ${nombreProyecto}${cuentaStr}${montoStr}${etapaStr}`;
        }

        // 2. Clientes con monto/empresa (ej. Top Clientes por ventas)
        const nombreCliente = row['Clientes.nombreCompleto'] || (row['Clientes.nombre'] ? `${row['Clientes.nombre']} ${row['Clientes.apellido'] || ''}`.trim() : '');
        if (nombreCliente) {
          const empresa = row['Empresas.nombre'] || row['empresa'] || '';
          const empresaStr = empresa ? ` (${empresa})` : '';
          const montoVal = row['Oportunidades.montoTotalMxnSum'] ?? row['montoTotalMxnSum'] ?? row['Oportunidades.montoTotal'] ?? row['montoTotal'];
          const montoStr = montoVal !== undefined && montoVal !== null && montoVal !== '' ? ` — Total: ${this.formatCurrency(montoVal, 'MXN')}` : '';
          const asesor = row['Usuarios.username'] || row['asesor'];
          const asesorStr = asesor ? ` — Asesor: ${asesor}` : '';
          return `${idx + 1}. ${nombreCliente}${empresaStr}${montoStr}${asesorStr}`;
        }

        // 3. Empresas
        const nombreEmpresa = row['Empresas.nombre'] || row['nombreEmpresa'];
        if (nombreEmpresa) {
          const montoVal = row['Oportunidades.montoTotalMxnSum'] ?? row['montoTotalMxnSum'] ?? row['Oportunidades.montoTotal'] ?? row['montoTotal'];
          const montoStr = montoVal !== undefined && montoVal !== null && montoVal !== '' ? ` — Total: ${this.formatCurrency(montoVal, 'MXN')}` : '';
          const telefono = row['Empresas.telefono'] ? ` — Tel: ${row['Empresas.telefono']}` : '';
          const asesorStr = row['Usuarios.username'] ? ` — Asesor: ${row['Usuarios.username']}` : '';
          return `${idx + 1}. ${nombreEmpresa}${montoStr}${telefono}${asesorStr}`;
        }

        // 4. Tickets
        const tituloTicket = row['Tickets.titulo'] || row['titulo'];
        if (tituloTicket) {
          const ticketNum = row['Tickets.ticketNumber'] ? `Ticket #${row['Tickets.ticketNumber']}: ` : '';
          const etapa = row['EtapasTicket.nombre'] ? ` [${row['EtapasTicket.nombre']}]` : '';
          const responsable = row['Usuarios.username'] ? ` — Responsable: ${row['Usuarios.username']}` : '';
          return `${idx + 1}. ${ticketNum}${tituloTicket}${etapa}${responsable}`;
        }

        // 5. Actividades
        const actividad = row['Actividades.actividad'] || row['actividad'];
        if (actividad) {
          const rawFecha = row['Actividades.fecha'] || row['fecha'];
          const fecha = rawFecha ? ` (${this.formatDateTime(rawFecha)})` : '';
          const tipo = row['TiposActividad.nombre'] ? ` [${row['TiposActividad.nombre']}]` : '';
          const asesor = row['Usuarios.username'] ? ` — Asesor: ${row['Usuarios.username']}` : '';
          return `${idx + 1}. ${actividad}${tipo}${fecha}${asesor}`;
        }

        // 6. Productos
        const nombreProducto = row['Productos.nombre'] || row['nombreProducto'];
        if (nombreProducto) {
          const precio = row['Productos.precioBase'] !== undefined ? ` — ${this.formatCurrency(row['Productos.precioBase'], 'MXN')}` : '';
          const unidad = row['Productos.unidadMedida'] ? ` por ${row['Productos.unidadMedida']}` : '';
          return `${idx + 1}. ${nombreProducto}${precio}${unidad}`;
        }

        // 7. Usuarios / Ejecutivos con métricas agregadas (conteo de oportunidades, monto de ventas, tickets, actividades)
        const username = row['Usuarios.username'] || row['username'] || row['Usuarios.nombre'] || row['nombreUsuario'];
        if (username) {
          const countOpp = row['Oportunidades.count'] ?? row['count'];
          const montoVal = row['Oportunidades.montoTotalMxnSum'] ?? row['montoTotalMxnSum'] ?? row['Oportunidades.montoTotal'] ?? row['montoTotal'];
          const countTickets = row['Tickets.count'];
          const countActs = row['Actividades.count'];

          const metrics: string[] = [];
          if (countOpp !== undefined) {
            const num = Number(countOpp);
            metrics.push(`${num} ${num === 1 ? 'oportunidad' : 'oportunidades'}`);
          }
          if (montoVal !== undefined && Number(montoVal) > 0) {
            metrics.push(`Monto: ${this.formatCurrency(montoVal, 'MXN')}`);
          }
          if (countTickets !== undefined) {
            const num = Number(countTickets);
            metrics.push(`${num} ${num === 1 ? 'ticket' : 'tickets'}`);
          }
          if (countActs !== undefined) {
            const num = Number(countActs);
            metrics.push(`${num} ${num === 1 ? 'actividad' : 'actividades'}`);
          }

          const metricsStr = metrics.length > 0 ? ` — ${metrics.join(' | ')}` : '';
          return `${idx + 1}. ${username}${metricsStr}`;
        }

        // Fallback genérico para cualquier fila
        const parts = Object.entries(row)
          .filter(([k]) => !k.toLowerCase().endsWith('id'))
          .map(([k, v]) => {
            if (this.isCurrencyField(k, annotation)) return this.formatCurrency(v, rowCurrency);
            return String(v);
          });
        return `${idx + 1}. ${parts.join(' — ')}`;
      })
      .join('\n');
  }

  /**
   * Genera un resumen inteligente y natural directamente a partir de los datos numéricos y entidades.
   */
  generateSmartSummary(
    cubeData: any[],
    originalQuestion: string,
    queryPlan: CubeQueryPlan,
    annotation?: CubeAnnotation,
  ): string {
    if (!cubeData || cubeData.length === 0) return 'No se encontraron resultados.';

    // 0. Detectar si los datos representan una comparativa o desglose por etapa (stageType)
    const hasStageType = cubeData.some(row => row['Etapas.stageType'] !== undefined || row['stageType'] !== undefined);
    const hasTicketStageType = cubeData.some(row => row['EtapasTicket.stageType'] !== undefined);
    const hasDescriptive = cubeData.some(row =>
      row['Oportunidades.nombreProyecto'] || row['nombreProyecto'] ||
      row['Tickets.titulo'] || row['titulo'] ||
      row['Actividades.actividad'] || row['actividad']
    );

    if (hasStageType && !hasDescriptive) {
      const lines: string[] = ['Resumen comparativo de oportunidades:'];
      for (const row of cubeData) {
        const st = row['Etapas.stageType'] ?? row['stageType'];
        const count = Number(row['Oportunidades.count'] ?? row['count'] ?? 0);
        const montoVal = row['Oportunidades.montoTotalMxnSum'] ?? row['montoTotalMxnSum'] ?? row['Oportunidades.montoTotalSum'] ?? row['montoTotalSum'] ?? 0;
        const montoStr = this.formatCurrency(montoVal, 'MXN');
        const countLabel = count === 1 ? '1 oportunidad' : `${count} oportunidades`;

        if (st === 0 || st === '0') {
          lines.push(`• En Pipeline (Abiertas): ${countLabel} — ${montoStr}`);
        } else if (st === 1 || st === '1') {
          lines.push(`• Ventas Ganadas: ${countLabel} — ${montoStr}`);
        } else if (st === 2 || st === '2') {
          lines.push(`• Perdidas / Canceladas: ${countLabel} — ${montoStr}`);
        } else {
          lines.push(`• Sin etapa clasificada: ${countLabel} — ${montoStr}`);
        }
      }
      return lines.join('\n');
    }

    if (hasTicketStageType && !hasDescriptive) {
      const lines: string[] = ['Resumen de tickets de soporte:'];
      for (const row of cubeData) {
        const st = row['EtapasTicket.stageType'];
        const count = Number(row['Tickets.count'] ?? row['count'] ?? 0);
        const countLabel = count === 1 ? '1 ticket' : `${count} tickets`;

        if (st === 0 || st === '0') {
          lines.push(`• Tickets Abiertos / En Proceso: ${countLabel}`);
        } else if (st === 1 || st === '1') {
          lines.push(`• Tickets Resueltos / Cerrados: ${countLabel}`);
        } else {
          lines.push(`• Sin etapa definida: ${countLabel}`);
        }
      }
      return lines.join('\n');
    }

    if (queryPlan.responseTemplate && !queryPlan.responseTemplate.includes('{')) {
      return queryPlan.responseTemplate;
    }

    if (cubeData.length === 1 && queryPlan.responseTemplate) {
      return this.simpleFormat(cubeData, queryPlan.responseTemplate, annotation);
    }

    let totalMonto = 0;
    let hasMonto = false;
    let detectedCurrency = 'MXN';

    for (const row of cubeData) {
      const rowCurrency = row['Oportunidades.moneda'] || row['moneda'] || 'MXN';
      for (const [key, val] of Object.entries(row)) {
        if (this.isCurrencyField(key, annotation)) {
          const num = typeof val === 'number' ? val : parseFloat(String(val || 0));
          if (!isNaN(num)) {
            totalMonto += num;
            hasMonto = true;
            if (key.toLowerCase().includes('mxn')) {
              detectedCurrency = 'MXN';
            } else if (rowCurrency && rowCurrency.toUpperCase() === 'USD' && cubeData.length === 1) {
              detectedCurrency = 'USD';
            }
          }
        }
      }
    }

    const count = cubeData.length;
    const qLower = (originalQuestion || '').toLowerCase();
    const isTopQuery = qLower.includes('top') || qLower.includes('antiguas') || qLower.includes('recientes') || qLower.includes('primeras') || qLower.includes('últimas') || qLower.includes('ultimas');
    const entityType = queryPlan.detectedEntity || 'registro';
    const entityLabel = entityType === 'Oportunidades' ? (count === 1 ? 'oportunidad' : 'oportunidades')
      : entityType === 'Tickets' ? (count === 1 ? 'ticket' : 'tickets')
      : entityType === 'Clientes' ? (count === 1 ? 'cliente' : 'clientes')
      : entityType === 'Empresas' ? (count === 1 ? 'empresa' : 'empresas')
      : entityType === 'Productos' ? (count === 1 ? 'producto' : 'productos')
      : (count === 1 ? 'registro' : 'registros');

    if (hasMonto && totalMonto > 0) {
      const formattedMonto = this.formatCurrency(totalMonto, detectedCurrency);
      if (isTopQuery) {
        return `Se encontraron las ${count} ${entityLabel} principales con un monto acumulado de ${formattedMonto}.`;
      }
      return `Se encontraron ${count} ${entityLabel} con un monto total de ${formattedMonto}.`;
    }

    if (isTopQuery) {
      return `Se encontraron las ${count} ${entityLabel} solicitadas:`;
    }

    return `Se encontraron ${count} ${entityLabel} para tu consulta.`;
  }

  /**
   * Formatea el resumen cuando se realiza una búsqueda multi-entidad (consultas vagas).
   */
  formatMultiEntitySummary(searchTerm: string, matches: EntityMatchItem[]): string {
    if (!matches || matches.length === 0) {
      return `No se encontraron coincidencias para "${searchTerm}" en clientes, empresas, usuarios, productos ni oportunidades.`;
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
      const headerLabel = entityType === 'Empresa' ? 'Empresas' : `${entityType}s`;
      sections.push(`${headerLabel} (${items.length}):`);
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
          (m.startsWith('Oportunidades.') || m.startsWith('Actividades.') || m.startsWith('Gastos.') || m.startsWith('Empresas.')),
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

      // No eliminar elementos de lista duplicados si corresponden a registros válidos (ej. oportunidades con el mismo nombre)
      if (seen.has(cleanLine) && !isListItem) {
        continue;
      }

      const isHeader = cleanLine.endsWith(':') || cleanLine.includes('aquí tiene') || cleanLine.includes('top');
      if (!isHeader && !isListItem) {
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

  /**
   * Interpola una fila de datos en una plantilla de texto reemplazando placeholders {columna}.
   */
  private interpolateTemplateRow(row: any, template: string, annotation?: CubeAnnotation): string {
    const rowCurrency = row['Oportunidades.moneda'] || row['moneda'] || 'MXN';
    let formatted = template;

    for (const [key, val] of Object.entries(row)) {
      const isCurrency = this.isCurrencyField(key, annotation);
      const fieldCurrency = key.toLowerCase().includes('mxn') ? 'MXN' : rowCurrency;
      let displayVal = '';

      if (val === null || val === undefined || val === '') {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('apellido')) {
          displayVal = '';
        } else if (keyLower.includes('username') || keyLower.includes('ejecutivo') || keyLower.includes('responsable')) {
          displayVal = 'Sin asignar';
        } else if (keyLower.includes('nombre') || keyLower.includes('name')) {
          displayVal = 'Sin nombre';
        } else if (isCurrency) {
          displayVal = `$0.00 ${fieldCurrency}`;
        } else if (keyLower.includes('count') || keyLower.includes('sum')) {
          displayVal = '0';
        } else {
          displayVal = 'No especificado';
        }
      } else {
        if (isCurrency) {
          displayVal = this.formatCurrency(val, fieldCurrency);
        } else if (typeof val === 'number') {
          displayVal = val.toLocaleString('es-MX');
        } else {
          displayVal = String(val);
        }
      }

      const placeholder = `{${key}}`;
      formatted = formatted.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), displayVal);

      const cleanKey = key.split('.').pop() || key;
      const cleanPlaceholder = `{${cleanKey}}`;
      formatted = formatted.replace(new RegExp(cleanPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), displayVal);
    }

    // Limpiar placeholders residuales para no mostrarlos al usuario
    formatted = formatted.replace(/\{[a-zA-Z0-9_.]+\}/g, '').replace(/\s{2,}/g, ' ').trim();
    formatted = formatted
      .replace(/\b(MXN|USD)\s+\1\b/gi, '$1')
      .replace(/\b(MXN|USD)\s+(pesos|dólares|dolares)\b/gi, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return formatted;
  }

  /**
   * Formateo simple basado en plantillas e interpolación de variables.
   */
  simpleFormat(data: any[], template?: string, annotation?: CubeAnnotation): string {
    if (data.length === 0) return 'No se encontraron resultados.';

    if (data.length === 1) {
      if (template) {
        return this.interpolateTemplateRow(data[0], template, annotation);
      }
      return this.formatDataRowsAsList(data, annotation);
    }

    // Para múltiples filas (data.length > 1)
    const listContent = this.formatDataRowsAsList(data, annotation);

    if (template) {
      if (template.includes('{')) {
        let header = this.interpolateTemplateRow(data[0], template, annotation);

        // Detectar si hay un empate en el primer lugar
        const firstCount = data[0]['Oportunidades.count'] ?? data[0]['count'] ?? data[0]['Tickets.count'] ?? data[0]['Actividades.count'];
        const secondCount = data[1]['Oportunidades.count'] ?? data[1]['count'] ?? data[1]['Tickets.count'] ?? data[1]['Actividades.count'];
        const firstUser = data[0]['Usuarios.username'] || data[0]['username'];
        const secondUser = data[1]['Usuarios.username'] || data[1]['username'];

        if (firstCount !== undefined && secondCount !== undefined && Number(firstCount) === Number(secondCount) && firstUser && secondUser) {
          const tiedUsers = data
            .filter(r => Number(r['Oportunidades.count'] ?? r['count'] ?? r['Tickets.count'] ?? r['Actividades.count']) === Number(firstCount))
            .map(r => `${r['Usuarios.username'] || r['username']}`);

          if (tiedUsers.length > 1) {
            header = `Hay un empate en el primer lugar entre ${tiedUsers.join(' y ')} con ${firstCount} oportunidades abiertas cada uno:`;
          }
        }

        return listContent ? `${header}\n\n${listContent}` : header;
      }

      return listContent ? `${template}\n\n${listContent}` : template;
    }

    return listContent;
  }
}
