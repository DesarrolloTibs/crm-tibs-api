import { Injectable, Logger } from '@nestjs/common';
import { AiAgentService } from '../../conversations/ai-agent.service';
import { WebchatEntityMatcherService } from './webchat-entity-matcher.service';
import { ConversationHistoryMessage, CubeQuery, CubeQueryPlan, RouterClassification, WebchatActionType, WebchatDomain } from '../interfaces/webchat.interfaces';

@Injectable()
export class WebchatQueryPlannerService {
  private readonly logger = new Logger('WebchatQueryPlannerService');

  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly entityMatcher: WebchatEntityMatcherService,
  ) {}

  /**
   * Normaliza secuencias de números dictados por voz en español (ej. teléfonos de 7 a 15 dígitos:
   * "ocho veintiséis ciento veintinueve cuarenta y dos diez" -> "8261294210") y correos dictados con "arroba" / "punto".
   */
  normalizeSpokenSpanishText(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let result = text.trim();

    if (/\barroba\b/i.test(result)) {
      result = result
        .replace(/\s+arroba\s+/gi, '@')
        .replace(/(\S+)\s+punto\s+(\S+)/gi, '$1.$2')
        .replace(/(\S+)\s+guion\s+bajo\s+(\S+)/gi, '$1_$2')
        .replace(/(\S+)\s+guion\s+(\S+)/gi, '$1-$2');
    }

    const unitsAndTeens: Record<string, number> = {
      cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
      seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
      trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
      dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21,
      veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
      veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
    };
    const tens: Record<string, number> = {
      treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
      setenta: 70, ochenta: 80, noventa: 90,
    };
    const hundreds: Record<string, number> = {
      cien: 100, ciento: 100, doscientos: 200, doscientas: 200,
      trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
      quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
      setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
      novecientos: 900, novecientas: 900,
    };

    const normWord = (w: string) =>
      w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const tokens = result.split(/\s+/);

    const parseSubHundred = (idx: number): { val: string; nextIdx: number } | null => {
      if (idx >= tokens.length) return null;
      const w = normWord(tokens[idx]);
      if (unitsAndTeens[w] !== undefined) {
        return { val: String(unitsAndTeens[w]), nextIdx: idx + 1 };
      }
      if (tens[w] !== undefined) {
        const base = tens[w];
        if (idx + 2 < tokens.length && normWord(tokens[idx + 1]) === 'y') {
          const u = normWord(tokens[idx + 2]);
          if (unitsAndTeens[u] !== undefined && unitsAndTeens[u] >= 1 && unitsAndTeens[u] <= 9) {
            return { val: String(base + unitsAndTeens[u]), nextIdx: idx + 3 };
          }
        }
        return { val: String(base), nextIdx: idx + 1 };
      }
      return null;
    };

    const parseNumberGroup = (idx: number): { val: string; nextIdx: number } | null => {
      if (idx >= tokens.length) return null;
      const w = normWord(tokens[idx]);
      if (/^\d+$/.test(w)) {
        return { val: w, nextIdx: idx + 1 };
      }
      if (hundreds[w] !== undefined) {
        const hVal = hundreds[w];
        if (w === 'cien') {
          return { val: '100', nextIdx: idx + 1 };
        }
        const sub = parseSubHundred(idx + 1);
        if (sub) {
          return { val: String(hVal + parseInt(sub.val, 10)), nextIdx: sub.nextIdx };
        }
        return { val: String(hVal), nextIdx: idx + 1 };
      }
      return parseSubHundred(idx);
    };

    const out: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const groups: string[] = [];
      let curr = i;
      while (curr < tokens.length) {
        const g = parseNumberGroup(curr);
        if (!g) break;
        groups.push(g.val);
        curr = g.nextIdx;
      }
      const joined = groups.join('');
      if (groups.length >= 2 && joined.length >= 7 && joined.length <= 15) {
        out.push(joined);
        i = curr;
      } else {
        out.push(tokens[i]);
        i++;
      }
    }
    return out.join(' ');
  }

  /**
   * Detecta si el mensaje inmediato anterior del asistente en el historial corresponde
   * a una solicitud activa de datos (slot-filling) o un registro recién creado susceptible de completarse.
   */
  detectPendingActionFromHistory(
    conversationHistory?: ConversationHistoryMessage[],
    currentQuestion?: string,
  ): WebchatActionType | null {
    if (!conversationHistory || conversationHistory.length === 0) return null;

    const assistantMessages = conversationHistory
      .filter(m => m && m.role === 'assistant' && m.content)
      .map(m => m.content);
    if (assistantMessages.length === 0) return null;

    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    const qNorm = this.normalizeSpokenSpanishText(currentQuestion || '');

    if (/Para registrar al cliente o contacto,\s*por favor ind[ií]came al menos su Nombre/i.test(lastAssistant)) {
      return 'createClient';
    }
    if (/Para registrar una nueva empresa,\s*por favor ind[ií]came al menos su Nombre/i.test(lastAssistant)) {
      return 'createCompany';
    }
    if (/Para poder crear(?:\s+la\s+oportunidad|\s+una\s+nueva\s+oportunidad)/i.test(lastAssistant)) {
      return 'createOpportunity';
    }
    if (/Para poder agendar|¿Para qu[eé] fecha y hora deseas programar|Horario no disponible/i.test(lastAssistant)) {
      return 'createActivity';
    }
    if (/Para levantar un ticket de soporte|Para poder levantar el ticket de soporte|ind[ií]came el t[ií]tulo o descripci[oó]n del problema/i.test(lastAssistant)) {
      return 'createTicket';
    }
    if (
      /encontr[eé] varios tickets que coinciden|ind[ií]came el folio o asunto del ticket que deseas (?:modificar|actualizar)|identifiqu[eé] el ticket .* pero no detect[eé] qu[eé] campo|para mover el ticket .* a la etapa .* es obligatorio registrar las notas de resoluci[oó]n|ind[ií]came c[oó]mo se solucion[oó] o las notas de cierre|ind[ií]came las notas de resoluci[oó]n/i.test(
        lastAssistant,
      )
    ) {
      return 'modifyTicket';
    }

    if (/Para registrar (?:un nuevo|el) producto.*ind[ií]came al menos su Nombre/i.test(lastAssistant)) {
      return 'createProduct';
    }
    if (
      /encontr[eé] varios productos que coinciden|ind[ií]came el nombre del producto que deseas (?:modificar|actualizar)|identifiqu[eé] el producto .* pero no detect[eé] qu[eé] campo/i.test(
        lastAssistant,
      )
    ) {
      return 'modifyProduct';
    }

    if (/Encontr[eé] varios clientes que coinciden|ind[ií]came el nombre o correo del cliente que deseas actualizar|Identifiqu[eé] al cliente .* pero no detect[eé] qu[eé] dato/i.test(lastAssistant)) {
      return 'modifyClient';
    }
    if (/Encontr[eé] varias empresas que coinciden|ind[ií]came el nombre de la empresa que deseas actualizar|Identifiqu[eé] a la empresa .* pero no detect[eé] qu[eé] campo/i.test(lastAssistant)) {
      return 'modifyCompany';
    }
    if (/Encontr[eé] varias oportunidades que coinciden|¿A qu[eé] etapa deseas mover/i.test(lastAssistant)) {
      return 'modifyOpportunity';
    }

    if (
      /para registrar el gasto necesito|¿cu[aá]l es el \*{0,2}(?:concepto|monto)|todo gasto debe asociarse a|¿a qu[eé] \*{0,2}cliente\*{0,2} o \*{0,2}oportunidad\*{0,2} deseas asociar este gasto|los gastos en el crm no se vinculan directamente a empresas|se encontraron m[uú]ltiples (?:clientes|oportunidades) posibles para asociar el gasto|para asociar el gasto/i.test(
        lastAssistant,
      )
    ) {
      return 'createExpense';
    }
    if (
      /encontr[eé] varios gastos que coinciden|ind[ií]came qu[eé] gasto deseas (?:modificar|actualizar)|identifiqu[eé] el gasto .* pero no detect[eé] qu[eé] campo|no encontr[eé] un gasto que coincida/i.test(
        lastAssistant,
      )
    ) {
      return 'modifyExpense';
    }

    const hasComplementaryContactData =
      /\b\d{7,15}\b/.test(qNorm) ||
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(qNorm) ||
      /\b(tel[eé]fono|cel(?:ular)?|correo|email|puesto|cargo|empresa|categor[ií]a|web(?:site)?|sitio\s+web|direcci[oó]n)\b/i.test(qNorm);

    const hasComplementaryExpenseData =
      !/^(cu[aá]nt|qu[eé]\s+gastos|lista|muestra|dame|ver|reporte|resumen)/i.test(qNorm) &&
      (/\b(monto|concepto|fecha|ayer|anteayer|antier|cliente|oportunidad|proyecto)\b/i.test(qNorm) ||
        /^\s*\$?\d+(?:[.,]\d{1,2})?\s*(?:pesos|mxn|usd)?\s*$/i.test(qNorm));

    const hasComplementaryProductData =
      !/^(cu[aá]nt|qu[eé]\s+productos|lista|muestra|dame|ver|cat[aá]logo|reporte|resumen)/i.test(qNorm) &&
      (/\b(precio(?:\s+base)?|unidad(?:\s+de\s+medida)?|descripci[oó]n|observaciones|notas|pieza|caja|servicio|licencia|hora|plan)\b/i.test(qNorm) ||
        /^\s*\$?\d+(?:[.,]\d{1,2})?\s*(?:pesos|mxn|usd)?\s*$/i.test(qNorm));

    const hasComplementaryTicketData =
      !/^(cu[aá]nt|qu[eé]\s+tickets|lista|muestra|dame|ver|reporte|resumen)/i.test(qNorm) &&
      /\b(prioridad|alta|media|baja|urgente|etapa|resuelto|en\s+proceso|notas(?:\s+de\s+resoluci[oó]n)?|responsable|asigna|ejecutivo)\b/i.test(qNorm);

    if (hasComplementaryExpenseData && /Gasto Registrado Exitosamente/i.test(lastAssistant)) {
      return 'modifyExpense';
    }
    if (hasComplementaryProductData && /Producto Registrado Exitosamente/i.test(lastAssistant)) {
      return 'modifyProduct';
    }
    if (hasComplementaryTicketData && /Ticket de Soporte Creado/i.test(lastAssistant)) {
      return 'modifyTicket';
    }

    if (hasComplementaryContactData && /Cliente Registrado Exitosamente/i.test(lastAssistant)) {
      return 'modifyClient';
    }
    if (hasComplementaryContactData && /Empresa Registrada Exitosamente/i.test(lastAssistant)) {
      return 'modifyCompany';
    }

    return null;
  }

  /**
   * Detecta cuando el usuario envía directamente el nombre de una persona + teléfono (7-15 dígitos) o correo
   * (ej. "carmen jones 8261294210") sin verbos de consulta analítica.
   */
  isDirectContactDictation(normalizedText: string): boolean {
    if (!normalizedText) return false;
    const clean = normalizedText.trim();
    if (this.isExplicitAnalyticalOrGreetingQuestion(clean)) return false;

    const hasPhone = /\b\d{7,15}\b/.test(clean);
    const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(clean);
    if (!hasPhone && !hasEmail) return false;

    const withoutContact = clean
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .replace(/\b\d{7,15}\b/g, '')
      .replace(/\b(tel[eé]fono|cel(?:ular)?|correo|email|nombre)\b/gi, '')
      .trim();

    const nameWords = withoutContact.split(/\s+/).filter(w => /^[a-zA-ZáéíóúÁÉÍÓÚñÑ]{2,}$/.test(w));
    return nameWords.length >= 1 && nameWords.length <= 5;
  }

  private isExplicitAnalyticalOrGreetingQuestion(text: string): boolean {
    const q = (text || '').toLowerCase().trim();
    if (/^(hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|gracias|adi[oó]s|cancelar|olv[ií]dalo)\b/i.test(q)) {
      return true;
    }
    return /\b(cu[aá]nt[oa]s?|qu[eé]\s+clientes|qu[eé]\s+empresas|qu[eé]\s+productos|cat[aá]logo\s+de\s+productos|lista\s+de|mu[eé]strame|dame\s+los|top\s+\d+|ventas\s+de|oportunidades\s+de|tickets\s+de|actividades\s+de|gastos\s+de|pipeline)\b/i.test(q);
  }

  private enrichActionParametersWithNormalizedInput(
    actionType: string,
    params: Record<string, any>,
    normalizedQuestion: string,
  ): void {
    if (!params || typeof params !== 'object') return;
    for (const key of Object.keys(params)) {
      if (typeof params[key] === 'string') {
        params[key] = this.normalizeSpokenSpanishText(params[key]);
      }
    }
    if (
      actionType === 'createClient' ||
      actionType === 'modifyClient' ||
      actionType === 'createCompany' ||
      actionType === 'modifyCompany' ||
      actionType === 'createExpense' ||
      actionType === 'modifyExpense' ||
      actionType === 'createProduct' ||
      actionType === 'modifyProduct' ||
      actionType === 'modifyTicket'
    ) {
      const shouldExtractBasic =
        Object.keys(params).length === 0 ||
        actionType === 'createExpense' ||
        actionType === 'modifyExpense' ||
        actionType === 'createProduct' ||
        actionType === 'modifyProduct' ||
        actionType === 'modifyTicket';
      const basic = shouldExtractBasic ? this.extractBasicActionParams(normalizedQuestion, actionType) : {};
      for (const [k, v] of Object.entries(basic)) {
        if (v !== undefined && v !== '' && (params[k] === undefined || params[k] === null || params[k] === '')) {
          params[k] = v;
        }
      }
    }
  }

  /**
   * Parsea la respuesta del Agente Orquestador (Router) y extrae la clasificación de dominio e intención.
   */
  parseRouterClassification(
    rawLlmResponse: string,
    question: string,
    conversationHistory?: ConversationHistoryMessage[],
  ): RouterClassification {
    const normalizedQuestion = this.normalizeSpokenSpanishText(question);
    const pendingAction = this.detectPendingActionFromHistory(conversationHistory, normalizedQuestion);
    const sanitized = this.aiAgentService.sanitizeJsonOutput(rawLlmResponse);

    try {
      let parsed: any;
      try {
        parsed = JSON.parse(sanitized);
      } catch {
        const jsonMatch = rawLlmResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(this.aiAgentService.sanitizeJsonOutput(jsonMatch[0]));
        } else {
          throw new Error('No JSON object found in router response');
        }
      }

      let domain: WebchatDomain = parsed.domain || this.inferDomainFromQuestion(question);
      let intent = parsed.intent || (domain === 'CONVERSATIONAL' ? 'CONVERSATIONAL' : (domain === 'ACTION_EXECUTION' ? 'ACTION_EXECUTION' : 'ANALYTICAL'));

      let actionPlan = parsed.actionPlan || null;
      if (actionPlan && actionPlan.action) {
        domain = 'ACTION_EXECUTION';
        intent = 'ACTION_EXECUTION';
        actionPlan.parameters = actionPlan.parameters || (actionPlan as any).params || parsed.parameters || {};
        this.enrichActionParametersWithNormalizedInput(actionPlan.action, actionPlan.parameters, normalizedQuestion);
        if (!actionPlan.thought) {
          actionPlan.thought = parsed.thought || 'Ruteo estructurado por IA.';
        }
      } else if (parsed.action || domain === 'ACTION_EXECUTION' || intent === 'ACTION_EXECUTION') {
        const actionType = parsed.action || pendingAction || this.inferActionTypeFromQuestion(normalizedQuestion);
        if (actionType) {
          const rawParams = parsed.parameters || parsed.params || parsed.data || {};
          this.enrichActionParametersWithNormalizedInput(actionType, rawParams, normalizedQuestion);
          actionPlan = {
            action: actionType,
            parameters: rawParams,
            thought: parsed.thought || 'Ruteo estructurado por IA.',
          };
          domain = 'ACTION_EXECUTION';
          intent = 'ACTION_EXECUTION';
        }
      } else if (
        (pendingAction || this.isDirectContactDictation(normalizedQuestion)) &&
        !this.isExplicitAnalyticalOrGreetingQuestion(normalizedQuestion)
      ) {
        const resolvedAction = pendingAction || 'createClient';
        actionPlan = {
          action: resolvedAction,
          parameters: this.extractBasicActionParams(normalizedQuestion, resolvedAction),
          thought: pendingAction
            ? `Recuperación heurística multi-turno para la acción activa ${pendingAction}.`
            : 'Recuperación heurística de dictado de datos de contacto.',

        };
        domain = 'ACTION_EXECUTION';
        intent = 'ACTION_EXECUTION';
      } else if (false) {
        const actionType = parsed.action || this.inferActionTypeFromQuestion(question);
        if (actionType) {
          actionPlan = {
            action: actionType,
            parameters: parsed.parameters || parsed.params || parsed.data || {},
            thought: parsed.thought || 'Ruteo estructurado por IA.',
          };
          domain = 'ACTION_EXECUTION';
          intent = 'ACTION_EXECUTION';
        }
      }

      return {
        thought: parsed.thought || 'Ruteo automático del orquestador.',
        intent: intent,
        domain: domain,
        canonicalSearchTerm: parsed.canonicalSearchTerm || (domain === 'VAGUE_SEARCH' ? question.trim() : undefined),
        responseTemplate: parsed.responseTemplate,
        actionPlan,
        dashboardRedirect: parsed.dashboardRedirect,
      };
    } catch (parseErr) {
      this.logger.warn(`[QueryPlanner - Router] Error parseando JSON de Router. Aplicando heurística.`);

      if (
        (pendingAction || this.isDirectContactDictation(normalizedQuestion)) &&
        !this.isExplicitAnalyticalOrGreetingQuestion(normalizedQuestion)
      ) {
        const resolvedAction = pendingAction || 'createClient';
        return {
          intent: 'ACTION_EXECUTION',
          domain: 'ACTION_EXECUTION',
          thought: pendingAction
            ? `Continuidad multi-turno para la acción activa ${pendingAction}.`
            : 'Recuperación de dictado de datos de contacto.',
          actionPlan: {
            action: resolvedAction,
            parameters: this.extractBasicActionParams(normalizedQuestion, resolvedAction),
            thought: `Continuidad multi-turno para ${resolvedAction}.`,
          },
        };
      }

      // Heurística si el LLM devolvió texto plano
      if (this.entityMatcher.isVagueQuery(question)) {
        return {
          intent: 'VAGUE_SEARCH',
          domain: 'VAGUE_SEARCH',
          canonicalSearchTerm: question.trim(),
          thought: 'Heurística de búsqueda vaga.',
        };
      }

      const inferredDomain = this.inferDomainFromQuestion(question);
      const isAction = inferredDomain === 'ACTION_EXECUTION';
      let actionPlan = null;
      if (isAction) {
        const actionType = this.inferActionTypeFromQuestion(question);
        if (actionType) {
          actionPlan = {
            action: actionType,
            parameters: this.extractBasicActionParams(question, actionType),
            thought: 'Recuperación heurística de acción.',
          };
        }
      }

      return {
        intent: inferredDomain === 'CONVERSATIONAL' ? 'CONVERSATIONAL' : (isAction ? 'ACTION_EXECUTION' : 'ANALYTICAL'),
        domain: inferredDomain,
        thought: 'Recuperación de ruteo por coincidencia de palabras clave.',
        responseTemplate: inferredDomain === 'CONVERSATIONAL' ? rawLlmResponse : undefined,
        actionPlan,
      };
    }
  }

  /**
   * Infiere el dominio adecuado a partir de palabras clave en caso de fallo de JSON en el Router.
   */
  inferDomainFromQuestion(question: string): WebchatDomain {
    const q = (question || '').toLowerCase().trim();

    // Verbos de acción imperativos o comandos de alta rápida ("nuevo producto", "nuevo cliente", etc.)
    const actionRegex = /^(crea|crear|genera|generar|registra|registrar|apunta|apuntar|anota|anotar|carga|cargar|captura|capturar|da\s+de\s+alta|dar\s+de\s+alta|agrega|agregar|agenda|agendar|programa|programar|modifica|modificar|actualiza|actualizar|corrige|corregir|reasigna|reasignar|edita|editar|cambia|cambiar|levanta|levantar|abre|abrir|pon|poner|asigna|asignar|mueve|muevela|mover|pasa|pasala|pasar|traslada|trasladar|resuelve|resolver|cierra|cerrar|soluciona|solucionar|(?:nuevo|nueva)\s+(?:producto|art[ií]culo|cliente|contacto|prospecto|lead|empresa|compañ[ií]a|ticket|incidencia|oportunidad|cotizaci[oó]n|actividad|gasto))\b/i;
    if (actionRegex.test(q)) {
      return 'ACTION_EXECUTION';
    }

    if (q.includes('ticket') || q.includes('incidencia') || q.includes('soporte') || q.includes('folio')) {
      return 'TICKETS';
    }
    if (q.includes('gasto') || q.includes('gastado') || q.includes('viático') || q.includes('viatico') || q.includes('reembolso') || q.includes('comprobante')) {
      return 'GASTOS';
    }
    if (q.includes('actividad') || q.includes('agenda') || q.includes('reunion') || q.includes('reunión') || q.includes('llamada') || q.includes('evento')) {
      return 'ACTIVIDADES';
    }
    if (q.includes('empresa') || q.includes('cliente') || q.includes('contacto') || q.includes('cuenta')) {
      return 'CLIENTES_EMPRESAS';
    }
    if (q.includes('producto') || q.includes('precio') || q.includes('catálogo') || q.includes('catalogo')) {
      return 'PRODUCTOS';
    }
    if (q.includes('hola') || q.includes('buenos') || q.includes('buenas') || q.includes('ayuda') || q.includes('quién eres') || q.includes('gracias')) {
      return 'CONVERSATIONAL';
    }
    return 'OPORTUNIDADES'; // Dominio principal por defecto
  }

  /**
   * Infiere el tipo de acción a partir del texto de la consulta.
   */
  inferActionTypeFromQuestion(
    question: string,
  ):
    | 'createOpportunity'
    | 'modifyOpportunity'
    | 'createActivity'
    | 'modifyActivity'
    | 'createTicket'
    | 'modifyTicket'
    | 'createClient'
    | 'modifyClient'
    | 'createCompany'
    | 'modifyCompany'
    | 'createExpense'
    | 'modifyExpense'
    | 'createProduct'
    | 'modifyProduct'
    | null {
    const q = (question || '').toLowerCase();
    const isModify =
      q.includes('modifica') ||
      q.includes('actualiza') ||
      q.includes('edita') ||
      q.includes('cambia') ||
      q.includes('reprograma') ||
      q.includes('mueve') ||
      q.includes('pasa') ||
      q.includes('traslada') ||
      q.includes('completa') ||
      q.includes('corrige') ||
      q.includes('corregir') ||
      q.includes('reasigna') ||
      q.includes('resuelve') ||
      q.includes('resolver') ||
      q.includes('cierra') ||
      q.includes('cerrar') ||
      q.includes('soluciona') ||
      q.includes('solucionar') ||
      q.includes('desactiva') ||
      q.includes('inactiva');

    if (q.includes('actividad') || q.includes('reunion') || q.includes('reunión') || q.includes('llamada') || q.includes('cita') || q.includes('agenda') || q.includes('programa')) {
      return isModify ? 'modifyActivity' : 'createActivity';
    }
    if (q.includes('ticket') || q.includes('incidencia') || q.includes('soporte') || q.includes('folio') || q.includes('reporte') || q.includes('falla')) {
      return isModify ? 'modifyTicket' : 'createTicket';
    }
    if (
      /\b(producto|productos|cat[aá]logo)\b/i.test(q) &&
      !/^(?:crea|crear|genera|generar|modifica|modificar|actualiza|actualizar|cambia|cambiar|mueve|muevela|pasa|pasala)\s+(?:una?\s+)?(?:oportunidad|cotizaci[oó]n|proyecto)\b/i.test(
        q,
      )
    ) {
      return isModify ? 'modifyProduct' : 'createProduct';
    }
    if (
      /\b(gasto|gastos|vi[aá]tico|vi[aá]ticos|reembolso|reembolsos)\b/i.test(q) &&
      !/^(?:crea|crear|genera|generar|modifica|modificar|actualiza|actualizar|cambia|cambiar|mueve|muevela|pasa|pasala)\s+(?:una?\s+)?(?:oportunidad|cotizaci[oó]n|proyecto)\b/i.test(
        q,
      )
    ) {
      return isModify ? 'modifyExpense' : 'createExpense';
    }
    if (q.includes('oportunidad') || q.includes('cotizacion') || q.includes('cotización') || q.includes('proyecto') || q.includes('venta') || q.includes('monto')) {
      return isModify ? 'modifyOpportunity' : 'createOpportunity';
    }
    if (
      /\b(crea(?:r)?|registra(?:r)?|da(?:r)?\s+de\s+alta|agrega(?:r)?|modifica(?:r)?|actualiza(?:r)?|edita(?:r)?|cambia(?:r)?)\s+(?:la\s+|una\s+|a\s+la\s+)?(empresa|cuenta\s+corporativa|compañ[ií]a)\b/i.test(q) ||
      ((q.includes('empresa') || q.includes('compañía') || q.includes('compania')) && !q.includes('cliente') && !q.includes('contacto') && !q.includes('prospecto') && !q.includes('lead'))
    ) {
      return isModify ? 'modifyCompany' : 'createCompany';
    }
    if (q.includes('cliente') || q.includes('contacto') || q.includes('prospecto') || q.includes('lead')) {
      return isModify ? 'modifyClient' : 'createClient';
    }
    return isModify ? 'modifyOpportunity' : 'createOpportunity';
  }

  /**
   * Extrae parámetros básicos de la pregunta en caso de rescate heurístico.
   */
  private extractBasicActionParams(question: string, actionType: string): Record<string, any> {
    const q = this.normalizeSpokenSpanishText(question).trim();
    const params: Record<string, any> = {};

    if (actionType === 'createOpportunity' || actionType === 'modifyOpportunity') {
      const stageMatch = q.match(/(?:muevela\s+a|mueve\s+a|mover\s+a|pasar\s+a|pasa\s+a|pasala\s+a|cambia\s+a|cambiar\s+a|etapa)\s+["']?([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+?)["']?(?:$|\.|\,)/i);
      if (stageMatch && stageMatch[1]) {
        params.etapa = stageMatch[1].trim();
      }
      params.nombreProyecto = q.replace(/^(crea|crear|genera|registra|modifica|actualiza|mueve|muevela|pasa|pasala)\s+(una\s+)?(oportunidad|cotizacion|cotización|proyecto)?\s*(para|de)?/i, '').trim();
    } else if (actionType === 'createActivity' || actionType === 'modifyActivity') {
      params.activity = q.replace(/^(crea|crear|agenda|agendar|programa|programar|registra|registrar)\s+(una\s+)?/i, '').trim() || q;

      // Extraer empresa si se especifica "de la empresa X" o "empresa X"
      const empMatch = q.match(/(?:de\s+la\s+empresa|empresa|cuenta)\s+["']?([^"',]+?)["']?(?:\s+mañana|\s+hoy|\s+el\s+|\s+con\s+|\s+para\s+|$)/i);
      if (empMatch && empMatch[1]) {
        params.empresa = empMatch[1].trim();
      }

      // Extraer cliente/contacto si se especifica "con X" o "para el cliente X"
      const clientMatch = q.match(/(?:con\s+el\s+cliente|para\s+el\s+cliente|con|para)\s+["']?([A-ZÁÉÍÓÚa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚa-záéíóúñ]+)?)["']?(?:\s+de\s+la\s+empresa|\s+de\s+|\s+mañana|\s+hoy|\s+el\s+|$)/i);
      if (clientMatch && clientMatch[1]) {
        const cand = clientMatch[1].trim();
        if (!['seguimiento', 'reunion', 'llamada', 'visita', 'correo'].includes(cand.toLowerCase())) {
          params.cliente = cand;
        }
      }

      // Extraer tipo de actividad si se especifica en la orden (ej. "demostración", "reunión", "llamada", "visita")
      const typeMatch = q.match(/\b(reuni[oó]n|llamada|visita|demostraci[oó]n|demo|correo)\b/i);
      if (typeMatch && typeMatch[1]) {
        params.tipoActividad = typeMatch[1].trim();
      }

      // Extraer fecha y hora preservando el segmento completo temporal (sin truncar el día del mes)
      const dateSegmentMatch = q.match(/(?:para\s+el\s+|el\s+|para\s+)?\b(pasado\s+mañana|pasado\s+manana|pasadomañana|pasadomanana|hoy|mañana|manana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|\d{1,2}(?:\s+de|\s+)[a-záéíóú]+|\d{4}-\d{2}-\d{2})\b.*$/i)
        || q.match(/\b(?:a\s+las?\s+|a\s+la\s+|para\s+las?\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm)?.*$/i);
      if (dateSegmentMatch && dateSegmentMatch[0]) {
        params.date = dateSegmentMatch[0].trim();
      } else {
        params.date = 'mañana a las 10am';
      }

      // Extraer recordatorio si se solicita (incluyendo typo común reordatorio y hora específica o relativa)
      const reminderMatch = q.match(/(?:recordatorio|reordatorio|recordar|alarma)\s+(?:a\s+las?|para\s+las?|a\s+la|para\s+la)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|misma\s+hora|al\s+momento|\d+\s*(?:horas?|hrs?|minutos?|mins?)\s+antes)?/i);
      if (reminderMatch) {
        params.recordatorio = reminderMatch[1] ? reminderMatch[1].trim() : true;
      } else if (/(?:recordatorio|reordatorio|recordar|alarma)/i.test(q)) {
        params.recordatorio = true;
      }
    } else if (actionType === 'createTicket') {
      params.title = q.replace(/^(crea|crear|levanta|levantar|abre|abrir|reporta)\s+(un\s+)?(ticket|incidencia|reporte)?\s*(por|de)?/i, '').trim() || q;
    } else if (actionType === 'modifyTicket') {
      const folioMatch =
        q.match(/(?:ticket|folio|incidencia)\s*(?:n[uú]mero|num|no\.?|#)?\s*(\d+)/i) ||
        q.match(/#(\d+)\b/);
      if (folioMatch && folioMatch[1]) {
        params.targetTicket = folioMatch[1].trim();
      } else {
        const titleTargetMatch = q.match(
          /(?:ticket|incidencia|reporte)\s+(?:de\s+|sobre\s+|llamad[oa]\s+|titulad[oa]\s+)?["']?([^"',\.]+?)["']?(?=\s+(?:a\s+la\s+etapa|a\s+resuelto|a\s+en\s+proceso|etapa|prioridad|notas|responsable|asignad[oa]|cliente)|$|[,.])/i,
        );
        if (titleTargetMatch && titleTargetMatch[1]) {
          params.targetTicket = titleTargetMatch[1].trim();
        }
      }

      const stageMatch = q.match(
        /\b(?:a\s+la\s+etapa\s+|etapa\s+|mueve(?:lo)?\s+a\s+|pasa(?:lo)?\s+a\s+|cambia(?:lo)?\s+a\s+|marca(?:lo)?\s+como\s+)(abierto|en\s+proceso|en\s+espera|pendiente|resuelto|cerrado|solucionado)\b/i,
      );
      if (stageMatch && stageMatch[1]) {
        params.etapa = stageMatch[1].trim();
      } else if (/\b(resuelve|resolver|cierra|cerrar|soluciona|solucionar)\b/i.test(q)) {
        params.etapa = 'Resuelto';
      }

      const notesMatch = q.match(
        /\b(?:notas(?:\s+de\s+resoluci[oó]n|\s+de\s+cierre)?|resoluci[oó]n|soluci[oó]n)\s*[:\-]?\s*["']?([^"'\n]+?)["']?$/i,
      );
      if (notesMatch && notesMatch[1]) {
        params.notasResolucion = notesMatch[1].trim();
      }

      const prioMatch = q.match(/\b(?:prioridad\s+)?(alta|urgente|media|normal|baja)\b/i);
      if (prioMatch && prioMatch[1]) {
        const p = prioMatch[1].toLowerCase();
        params.priority = p === 'alta' || p === 'urgente' ? 3 : p === 'media' || p === 'normal' ? 2 : 1;
      }

      const respMatch = q.match(
        /\b(?:responsable|asigna(?:r|do)?\s+a(?:l\s+ejecutivo|\s+agente)?|reasigna(?:r)?\s+a)\s+["']?([^"',\.]+?)["']?(?=\s+(?:con|prioridad|etapa|notas)|$|[,.])/i,
      );
      if (respMatch && respMatch[1]) {
        params.responsable = respMatch[1].trim();
      }

      const cliMatch = q.match(
        /\b(?:para\s+el\s+cliente|del\s+cliente|cliente)\s+["']?([^"',\.]+?)["']?(?=\s+(?:con|prioridad|etapa|notas|responsable)|$|[,.])/i,
      );
      if (cliMatch && cliMatch[1]) {
        params.cliente = cliMatch[1].trim();
      }
    } else if (actionType === 'createProduct' || actionType === 'modifyProduct') {
      const cleanedRaw = q.trim();
      const priceMatch =
        cleanedRaw.match(/(?:precio(?:\s+base)?|costo|valor|a|por|de)\s*:?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i) ||
        cleanedRaw.match(/\b(?:precio(?:\s+base)?|costo|valor)\s*(?:de|a|:)?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
        cleanedRaw.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/i) ||
        cleanedRaw.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:pesos|mxn|usd|d[oó]lares)\b/i) ||
        cleanedRaw.match(/\b(?:a|por)\s+([\d,]+(?:\.\d{1,2})?)\s*$/i);
      if (priceMatch && priceMatch[1]) {
        const parsedPrice = Number(priceMatch[1].replace(/,/g, ''));
        if (!Number.isNaN(parsedPrice) && parsedPrice >= 0) {
          params.precioBase = parsedPrice;
        }
      } else if (/^\s*\$?\d+(?:[.,]\d{1,2})?\s*(?:pesos|mxn|usd)?\s*$/i.test(cleanedRaw)) {
        params.precioBase = Number(cleanedRaw.replace(/[^\d.]/g, ''));
      }

      const unitMatch =
        cleanedRaw.match(/\bunidad(?:\s+de\s+medida)?\s*[:\s]+["']?([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,20}?)["']?(?=\s+(?:precio|descripci[oó]n|observaciones|con|y)|$|[,.])/i) ||
        cleanedRaw.match(/\bpor\s+(pieza|caja|servicio|licencia|hora|mes|anualidad|paquete|plan| lote|kit|unidad)\b/i);
      if (unitMatch && unitMatch[1]) {
        params.unidadMedida = unitMatch[1].trim();
      }

      const descMatch = cleanedRaw.match(
        /\bdescripci[oó]n\s*[:\s]+["']?([^"',;\n]+?)["']?(?=\s+(?:precio|unidad|observaciones)|$|[,.])/i,
      );
      if (descMatch && descMatch[1]) {
        params.descripcion = descMatch[1].trim();
      }

      const obsMatch = cleanedRaw.match(
        /\b(?:observaciones|notas)\s*[:\s]+["']?([^"',;\n]+?)["']?(?=\s+(?:precio|unidad|descripci[oó]n)|$|[,.])/i,
      );
      if (obsMatch && obsMatch[1]) {
        params.observaciones = obsMatch[1].trim();
      }

      if (/\b(inactivo|desactivar|desactiva|baja)\b/i.test(cleanedRaw)) {
        params.status = false;
      } else if (/\b(activo|activar|activa|reactivar)\b/i.test(cleanedRaw)) {
        params.status = true;
      }

      const newNameMatch = cleanedRaw.match(
        /\b(?:nuevo\s+nombre|renombra(?:r)?\s+a|nombre\s+a)\s+["']?([^"',;\n]+?)["']?(?=\s+(?:precio|unidad|descripci[oó]n|observaciones)|$|[,.])/i,
      );
      if (newNameMatch && newNameMatch[1]) {
        params.nuevoNombre = newNameMatch[1].trim();
      }

      const prodNameMatch = cleanedRaw.match(
        /\b(?:producto|art[ií]culo|servicio(?:\s+del\s+cat[aá]logo)?)\s+(?:llamad[oa]\s+)?["']?([^"',;\n]+?)["']?(?=\s+(?:con\s+precio|precio|costo|a\s+\$?\d|por\s+\$?\d|de\s+\$?\d|unidad|descripci[oó]n|observaciones|nuevo\s+nombre|a\s+inactivo|a\s+activo)|$|[,.])/i,
      );
      if (prodNameMatch && prodNameMatch[1]) {
        const cleanProdName = prodNameMatch[1]
          .replace(/\b(nuevo|nueva|en\s+el\s+cat[aá]logo|del\s+cat[aá]logo)\b/gi, '')
          .trim();
        if (
          cleanProdName &&
          !/^(?:(?:un|una|el|la|nuevo|nueva)\s+)*(?:producto|productos|art[ií]culo|art[ií]culos|servicio|servicios)(?:\s+(?:nuevo|nueva))?$/i.test(
            cleanProdName,
          )
        ) {
          if (actionType === 'modifyProduct') {
            params.targetProduct = cleanProdName;
          } else {
            params.nombre = cleanProdName;
          }
        }
      } else {
        const residualProd = cleanedRaw
          .replace(/\b(?:con\s+precio|precio(?:\s+base)?|costo|valor)\s*(?:de|a|:)?\s*\$?\s*[\d,]+(?:\.\d{1,2})?\s*(?:pesos|mxn|usd|d[oó]lares)?/gi, ' ')
          .replace(/\$\s*[\d,]+(?:\.\d{1,2})?\s*(?:pesos|mxn|usd|d[oó]lares)?/gi, ' ')
          .replace(/\b[\d,]+(?:\.\d{1,2})?\s*(?:pesos|mxn|usd|d[oó]lares)\b/gi, ' ')
          .replace(/\bunidad(?:\s+de\s+medida)?\s*[:\s]+[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,20}/gi, ' ')
          .replace(/\bpor\s+(?:pieza|caja|servicio|licencia|hora|mes|anualidad|paquete|plan|kit|unidad)\b/gi, ' ')
          .replace(/\bdescripci[oó]n\s*[:\s]+[^"',;\n]+/gi, ' ')
          .replace(/\b(?:observaciones|notas)\s*[:\s]+[^"',;\n]+/gi, ' ')
          .replace(/\b(?:nuevo\s+nombre|renombra(?:r)?\s+a|nombre\s+a)\s+[^"',;\n]+/gi, ' ')
          .replace(/^(?:crea(?:r)?|registra(?:r)?|agrega(?:r)?|da(?:r)?\s+de\s+alta|modifica(?:r)?|actualiza(?:r)?|edita(?:r)?|cambia(?:r)?|nuevo|nueva|un|una|el|la|producto|art[ií]culo|servicio(?:\s+del\s+cat[aá]logo)?|en\s+el\s+cat[aá]logo|del\s+cat[aá]logo|nombre|se\s+llama|llamad[oa]|es)\b[\s:]*/gi, '')
          .replace(/[,\.:\-]+$/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (
          residualProd &&
          residualProd.length >= 2 &&
          !/^(?:(?:un|una|el|la|nuevo|nueva)\s+)*(?:producto|productos|art[ií]culo|art[ií]culos|servicio|servicios|cat[aá]logo|nuevo|nueva)(?:\s+(?:nuevo|nueva|en\s+el\s+cat[aá]logo))?$/i.test(
            residualProd,
          )
        ) {
          if (actionType === 'modifyProduct') {
            params.targetProduct = residualProd;
          } else {
            params.nombre = residualProd;
          }
        }
      }
    } else if (actionType === 'createClient' || actionType === 'modifyClient') {
      const emailMatch = q.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) params.correo = emailMatch[0].trim();

      const phoneMatch = q.match(/(?:tel[eé]fono|cel(?:ular)?|n[uú]mero|tel)[:\s]*([+\d\s\-()]{7,18})/i) || q.match(/\b(\d{10}|\d{2,3}[\s-]\d{3,4}[\s-]\d{4})\b/);
      if (phoneMatch && phoneMatch[1]) params.telefono = phoneMatch[1].trim();

      const empMatch = q.match(/(?:de\s+la\s+empresa|en\s+la\s+empresa|empresa|compañ[ií]a|cuenta)\s+["']?([^"',\.]+?)["']?(?:\s+con\s+|\s+correo|\s+tel|\s+puesto|\s+cargo|,|$)/i);
      if (empMatch && empMatch[1]) params.empresa = empMatch[1].trim();

      const puestoMatch = q.match(/(?:puesto|cargo|como)\s+(?:de\s+)?["']?([^"',\.]+?)["']?(?:\s+en\s+|\s+de\s+la\s+empresa|\s+con\s+|\s+correo|\s+tel|,|$)/i);
      if (puestoMatch && puestoMatch[1]) params.puesto = puestoMatch[1].trim();

      const catMatch = q.match(/\b(?:categor[ií]a|tipo|como)\s+(lead|prospecto|contacto|cliente)\b/i);
      if (catMatch && catMatch[1]) params.category = catMatch[1].trim();

      const nameMatch = q.match(/(?:cliente|contacto|prospecto|lead)\s+["']?([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){0,3})["']?(?:\s+de\s+la\s+empresa|\s+empresa|\s+con\s+|\s+correo|\s+tel|\s+puesto|,|$)/i);
      if (nameMatch && nameMatch[1]) {
        const cleanedName = nameMatch[1].replace(/\b(con|de|en|correo|email|telefono|teléfono|puesto|empresa|nuevo|nueva)\b.*$/i, '').trim();
        if (cleanedName) {
          if (actionType === 'modifyClient') {
            params.targetClient = cleanedName;
          } else {
            params.nombre = cleanedName;
          }
        }
      } else {
        const residualName = q
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
          .replace(/(?:tel[eé]fono|cel(?:ular)?|n[uú]mero|tel)[:\s]*[+\d\s\-()]{7,18}/gi, '')
          .replace(/\b\d{7,15}\b/g, '')
          .replace(/(?:de\s+la\s+empresa|en\s+la\s+empresa|empresa|compañ[ií]a|cuenta)\s+[^,\.]+/gi, '')
          .replace(/(?:puesto|cargo)\s+[^,\.]+/gi, '')
          .replace(/\b(?:categor[ií]a|tipo)\s+(?:lead|prospecto|contacto|cliente)\b/gi, '')
          .replace(/^(?:crea(?:r)?|registra(?:r)?|agrega(?:r)?|da(?:r)?\s+de\s+alta|modifica(?:r)?|actualiza(?:r)?|nuevo|nueva|cliente|contacto|prospecto|lead|nombre|se\s+llama|es)\b[\s:]*/gi, '')
          .replace(/\b(?:tel[eé]fono|cel(?:ular)?|correo|email|con|y)\b/gi, '')
          .replace(/[,\.:\-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (residualName && residualName.length >= 2 && !/^(cliente|contacto|nuevo|nueva)$/i.test(residualName)) {
          if (actionType === 'modifyClient') {
            params.targetClient = residualName;
          } else {
            params.nombre = residualName;
          }
        }
      }

      if (nameMatch && nameMatch[1]) {
        const cleanedName = nameMatch[1].replace(/\b(con|de|en|correo|email|telefono|teléfono|puesto|empresa|nuevo|nueva)\b.*$/i, '').trim();
        if (cleanedName) {
          if (actionType === 'modifyClient') {
            params.targetClient = cleanedName;
          } else {
            params.nombre = cleanedName;
          }
        }
      }
    } else if (actionType === 'createCompany' || actionType === 'modifyCompany') {
      const emailMatch = q.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) params.correo = emailMatch[0].trim();

      const phoneMatch = q.match(/(?:tel[eé]fono|cel(?:ular)?|n[uú]mero|tel)[:\s]*([+\d\s\-()]{7,18})/i) || q.match(/\b(\d{10}|\d{2,3}[\s-]\d{3,4}[\s-]\d{4})\b/);
      if (phoneMatch && phoneMatch[1]) params.telefono = phoneMatch[1].trim();

      const webMatch = q.match(/(?:web(?:site)?|sitio\s+web|p[aá]gina)\s*[:\s]*((?:https?:\/\/|www\.)[^\s,]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s,]*)?)/i);
      if (webMatch && webMatch[1]) params.website = webMatch[1].trim();

      const dirMatch = q.match(/(?:direcci[oó]n|ubicaci[oó]n|domicilio)\s*[:\s]+["']?([^"',\.]+)["']?/i);
      if (dirMatch && dirMatch[1]) params.direccion = dirMatch[1].trim();

      const compMatch = q.match(/(?:empresa|compañ[ií]a|cuenta(?:\s+corporativa)?)\s+["']?([^"',\.]+?)["']?(?:\s+con\s+|\s+correo|\s+tel|\s+web|\s+direcci[oó]n|,|$)/i);
      if (compMatch && compMatch[1]) {
        const cleanedComp = compMatch[1].replace(/\b(con|correo|email|telefono|teléfono|website|web|direccion|dirección|nueva|nuevo)\b.*$/i, '').trim();
        if (cleanedComp) {
          if (actionType === 'modifyCompany') {
            params.targetCompany = cleanedComp;
          } else {
            params.nombre = cleanedComp;
          }
        }
      } else {
        const residualComp = q
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
          .replace(/(?:tel[eé]fono|cel(?:ular)?|n[uú]mero|tel)[:\s]*[+\d\s\-()]{7,18}/gi, '')
          .replace(/\b\d{7,15}\b/g, '')
          .replace(/(?:web(?:site)?|sitio\s+web|p[aá]gina)\s*[:\s]*[^\s,]+/gi, '')
          .replace(/(?:direcci[oó]n|ubicaci[oó]n|domicilio)\s*[:\s]+[^,\.]+/gi, '')
          .replace(/^(?:crea(?:r)?|registra(?:r)?|agrega(?:r)?|da(?:r)?\s+de\s+alta|modifica(?:r)?|actualiza(?:r)?|nueva|nuevo|empresa|compañ[ií]a|cuenta|nombre|se\s+llama|es)\b[\s:]*/gi, '')
          .replace(/\b(?:tel[eé]fono|cel(?:ular)?|correo|email|con|y)\b/gi, '')
          .replace(/[,\.:\-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (residualComp && residualComp.length >= 2 && !/^(empresa|compañia|compañía|nueva|nuevo)$/i.test(residualComp)) {
          if (actionType === 'modifyCompany') {
            params.targetCompany = residualComp;
          } else {
            params.nombre = residualComp;
          }
        }
      }

      if (compMatch && compMatch[1]) {
        const cleanedComp = compMatch[1].replace(/\b(con|correo|email|telefono|teléfono|website|web|direccion|dirección|nueva|nuevo)\b.*$/i, '').trim();
        if (cleanedComp) {
          if (actionType === 'modifyCompany') {
            params.targetCompany = cleanedComp;
          } else {
            params.nombre = cleanedComp;
          }
        }
      }
    } else if (actionType === 'createExpense' || actionType === 'modifyExpense') {
      const cleanedRaw = q.trim();
      if (/^\s*\$?\d+(?:[.,]\d{1,2})?\s*(?:pesos|mxn|usd)?\s*$/i.test(cleanedRaw)) {
        params.monto = Number(cleanedRaw.replace(/[^\d.]/g, ''));
      }

      const amountMatch =
        cleanedRaw.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/i) ||
        cleanedRaw.match(/\bmonto(?:\s+de)?\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\b/i) ||
        cleanedRaw.match(
          /\b(?:de|por|a)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:pesos|mxn|usd|d[oó]lares)?\b(?!\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b)/i,
        ) ||
        cleanedRaw.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:pesos|mxn|usd|d[oó]lares)\b/i);

      if (amountMatch && amountMatch[1]) {
        const parsedAmount = Number(amountMatch[1].replace(/,/g, ''));
        if (!Number.isNaN(parsedAmount) && parsedAmount > 0) {
          params.monto = parsedAmount;
        }
      }

      const dateMatch = cleanedRaw.match(
        /\b(?:fecha(?:\s+(?:del|a|para|en|:))?\s*)?(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|hoy|ayer|anteayer|antier|hace\s+\d+\s+d[ií]as?|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?|(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+pasado)\b/i,
      );
      if (dateMatch && dateMatch[1]) {
        params.fecha = dateMatch[1].trim();
      }

      const oppMatch = cleanedRaw.match(
        /\b(?:para\s+la\s+|de\s+la\s+|a\s+la\s+|en\s+la\s+)?(?:oportunidad|cotizaci[oó]n|proyecto)\s+["']?([^,.;"'\n]+?)["']?(?=\s+(?:por|de|monto|fecha|hoy|ayer|anteayer|antier|el\s+\d|con\s+(?:el\s+)?cliente|para\s+el\s+ejecutivo|asignad[oa])|$|[,.])/i,
      );
      if (oppMatch && oppMatch[1]) {
        params.oportunidad = oppMatch[1].trim();
      }

      const clientMatch = cleanedRaw.match(
        /\b(?:para\s+el\s+|del\s+|con\s+(?:el\s+)?|al?\s+)cliente\s+["']?([^,.;"'\n]+?)["']?(?=\s+(?:por|de\s+\$?\d|monto|fecha|hoy|ayer|anteayer|antier|el\s+\d|para\s+(?:la\s+)?oportunidad|asignad[oa]|ejecutivo)|$|[,.])/i,
      );
      if (clientMatch && clientMatch[1]) {
        params.cliente = clientMatch[1].trim();
      }

      const execMatch = cleanedRaw.match(
        /\b(?:para\s+el\s+|asignad[oa]\s+(?:a|al)\s+)?ejecutivo\s+["']?([^,.;"'\n]+?)["']?(?=\s+(?:por|de|monto|fecha|hoy|ayer|cliente|oportunidad)|$|[,.])/i,
      );
      if (execMatch && execMatch[1]) {
        params.ejecutivo = execMatch[1].trim();
      }

      if (actionType === 'modifyExpense') {
        const targetMatch = cleanedRaw.match(
          /\b(?:el\s+|del\s+|los\s+)?(?:gastos?|vi[aá]ticos?|reembolsos?)\s+(?:de\s+|del\s+)?["']?([^,.;"'\n]+?)["']?(?=\s+(?:a\s+\$?\d|a\s+hoy|a\s+ayer|por\s+\$?\d|para\s+(?:el\s+cliente|la\s+oportunidad)|al\s+cliente|a\s+la\s+oportunidad|monto|concepto|fecha|con\s+(?:nuevo|el))|$|[,.])/i,
        );
        if (targetMatch && targetMatch[1]) {
          const candidateTarget = targetMatch[1]
            .replace(/\b(?:que\s+(?:era|cost[oó]|fue)|de\s+\$?\d+(?:[.,]\d{1,2})?)\b/gi, '')
            .trim();
          if (candidateTarget && !/^(hoy|ayer|anteayer|antier|\d+)$/i.test(candidateTarget)) {
            params.targetExpense = candidateTarget;
          }
        }

        const newConceptMatch = cleanedRaw.match(
          /\bconcepto\s+(?:a|por|=)\s+["']?([^,.;"'\n]+?)["']?(?=\s+(?:y\s+monto|monto|fecha|cliente|oportunidad)|$|[,.])/i,
        );
        if (newConceptMatch && newConceptMatch[1]) {
          params.concepto = newConceptMatch[1].trim();
        }
      } else {
        const conceptMatch = cleanedRaw.match(
          /\bconcepto\s*:?\s*["']?([^,.;"'\n]+?)["']?(?=\s+(?:monto|por\s+\$?\d|de\s+\$?\d|fecha|hoy|ayer|cliente|oportunidad)|$|[,.])/i,
        );
        if (conceptMatch && conceptMatch[1]) {
          params.concepto = conceptMatch[1].trim();
        } else if (
          /\b(crea(?:r)?|registra(?:r)?|apunta(?:r)?|anota(?:r)?|carga(?:r)?|captura(?:r)?|agrega(?:r)?|genera(?:r)?|gastos?|vi[aá]ticos?|reembolsos?)\b/i.test(
            cleanedRaw,
          )
        ) {
          const extractedConcept = cleanedRaw
            .replace(
              /^(?:crea(?:r)?|registra(?:r)?|apunta(?:r)?|anota(?:r)?|carga(?:r)?|captura(?:r)?|agrega(?:r)?|genera(?:r)?)\s+(?:un\s+|unos\s+)?(?:nuevo\s+)?(?:gastos?|vi[aá]ticos?|reembolsos?)\s*(?:de|por|en)?\s*/i,
              '',
            )
            .replace(/\$?\s*[\d,]+(?:\.\d{1,2})?\s*(?:pesos|mxn|usd|d[oó]lares)?/gi, ' ')
            .replace(/\b(?:para\s+la\s+|de\s+la\s+|a\s+la\s+|en\s+la\s+)?(?:oportunidad|cotizaci[oó]n|proyecto)\s+[^,.;]+/gi, ' ')
            .replace(/\b(?:para\s+el\s+|del\s+|con\s+(?:el\s+)?|al?\s+)cliente\s+[^,.;]+/gi, ' ')
            .replace(/\b(?:para\s+el\s+|asignad[oa]\s+(?:a|al)\s+)?ejecutivo\s+[^,.;]+/gi, ' ')
            .replace(
              /\b(?:fecha(?:\s+(?:del|a|para|en|:))?\s*)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|hoy|ayer|anteayer|antier|hace\s+\d+\s+d[ií]as?|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?|(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+pasado)\b/gi,
              ' ',
            )
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^(?:de|por|en|con|para|y)\s+/i, '')
            .replace(/\s+(?:de|por|en|con|para|a|del|al|y)$/i, '')
            .trim();
          if (extractedConcept && extractedConcept.length >= 2) {
            params.concepto = extractedConcept;
          }
        }
      }
    }
    return params;
  }

  /**
   * Procesa la respuesta sin procesar del LLM y la convierte en un CubeQueryPlan validado.
   */
  parsePlanFromLlm(rawLlmResponse: string, question: string): CubeQueryPlan {
    const sanitized = this.aiAgentService.sanitizeJsonOutput(rawLlmResponse);

    try {
      const plan: CubeQueryPlan = JSON.parse(sanitized);

      // Si el LLM no categorizó la intención explícitamente pero la consulta es corta/vaga
      if (!plan.intent && this.entityMatcher.isVagueQuery(question)) {
        plan.intent = 'VAGUE_SEARCH';
        plan.canonicalSearchTerm = plan.canonicalSearchTerm || question.trim();
      }

      return plan;
    } catch (parseErr) {
      this.logger.warn(`[QueryPlanner] No se pudo parsear JSON directo del LLM. Aplicando recuperación.`);

      // Intento 2: Buscar bloques JSON completos o parciales en el texto crudo
      try {
        const jsonMatch = rawLlmResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const cleaned = this.aiAgentService.sanitizeJsonOutput(jsonMatch[0]);
          const recoveredPlan = JSON.parse(cleaned);
          if (recoveredPlan && (recoveredPlan.cubeQuery || recoveredPlan.cubeQueries || recoveredPlan.intent)) {
            return recoveredPlan;
          }
        }
      } catch (jsonErr) {
        // Continuar con heurística si falla el bloque JSON
      }

      // Intento de recuperación de respuesta directa si el LLM devolvió texto plano
      const answerMatch = rawLlmResponse.match(/"responseTemplate"\s*:\s*"([^"]+)"/i) ||
                          rawLlmResponse.match(/"answer"\s*:\s*"([^"]+)"/i);

      // Si tiene plantilla pero NO contiene placeholders de Cube.dev (ej. saludo o texto estático)
      if (answerMatch && !answerMatch[1].includes('{')) {
        return {
          intent: 'CONVERSATIONAL',
          responseTemplate: answerMatch[1],
        };
      }

      // Si la consulta parece una búsqueda de nombre simple
      if (this.entityMatcher.isVagueQuery(question)) {
        return {
          intent: 'VAGUE_SEARCH',
          canonicalSearchTerm: question.trim(),
          thought: 'Recuperación automática para consulta vaga.',
        };
      }

      // Si la consulta contenía palabras de oportunidades/ventas perdidas o ganadas, construir plan analítico de respaldo
      const qLower = (question || '').toLowerCase();
      if (qLower.includes('perdida') || qLower.includes('perdido')) {
        return {
          intent: 'ANALYTICAL',
          detectedEntity: 'Oportunidades',
          canonicalSearchTerm: question.trim(),
          cubeQuery: {
            measures: ['Oportunidades.count', 'Oportunidades.montoTotalMxnSum'],
            dimensions: [
              'Oportunidades.nombreProyecto',
              'Usuarios.username',
              'Oportunidades.cuentaOCliente',
              'Oportunidades.montoTotal',
              'Oportunidades.moneda',
              'Etapas.nombre',
            ],
            filters: [
              { member: 'Etapas.stageType', operator: 'equals', values: ['2'] },
              { member: 'Oportunidades.archived', operator: 'equals', values: ['false'] },
            ],
            order: { 'Oportunidades.montoTotalMxnSum': 'desc' },
          },
          responseTemplate: 'Oportunidades perdidas registradas:',
        };
      }

      if (qLower.includes('venta') || qLower.includes('ganada') || qLower.includes('ganado')) {
        return {
          intent: 'ANALYTICAL',
          detectedEntity: 'Oportunidades',
          canonicalSearchTerm: question.trim(),
          cubeQuery: {
            measures: ['Oportunidades.count', 'Oportunidades.montoTotalMxnSum'],
            dimensions: [
              'Oportunidades.nombreProyecto',
              'Usuarios.username',
              'Oportunidades.cuentaOCliente',
              'Oportunidades.montoTotal',
              'Oportunidades.moneda',
              'Etapas.nombre',
            ],
            filters: [
              { member: 'Etapas.stageType', operator: 'equals', values: ['1'] },
              { member: 'Oportunidades.archived', operator: 'equals', values: ['false'] },
            ],
            order: { 'Oportunidades.montoTotalMxnSum': 'desc' },
          },
          responseTemplate: 'Ventas ganadas registradas:',
        };
      }

      return {
        intent: 'CONVERSATIONAL',
        thought: 'Fallo al parsear JSON del LLM.',
        responseTemplate: 'Lo siento, no pude interpretar correctamente tu consulta. ¿Podrías reformularla?',
      };
    }
  }

  /**
   * Extrae y divide las consultas generadas por el LLM si abarcan múltiples temas/cubos primarios.
   */
  extractAndSplitQueries(queryPlan: CubeQueryPlan): CubeQuery[] {
    let rawQueries: CubeQuery[] = [];
    if (queryPlan.cubeQueries && Array.isArray(queryPlan.cubeQueries) && queryPlan.cubeQueries.length > 0) {
      rawQueries = queryPlan.cubeQueries;
    } else if (queryPlan.cubeQuery && Object.keys(queryPlan.cubeQuery).length > 0) {
      rawQueries = [queryPlan.cubeQuery];
    }

    if (rawQueries.length === 0) return [];

    const finalQueries: CubeQuery[] = [];
    // Entidades raíz no vinculables entre sí en una sola agregación
    const ROOT_CUBES = ['Oportunidades', 'Tickets', 'Actividades', 'Gastos', 'Productos', 'Empresas'];

    for (const q of rawQueries) {
      if (!q) continue;

      const measures = q.measures || [];
      const rootCubesInMeasures = new Set<string>();
      for (const m of measures) {
        if (typeof m === 'string' && m.includes('.')) {
          const cube = m.split('.')[0];
          if (ROOT_CUBES.includes(cube)) {
            rootCubesInMeasures.add(cube);
          }
        }
      }

      // Solo dividimos si una sola query intenta medir simultáneamente más de una entidad raíz no vinculable (ej: Oportunidades.count y Tickets.count)
      if (rootCubesInMeasures.size > 1) {
        this.logger.log(`[QueryPlanner - MultiCube Split] Dividiendo consulta multi-cubo independiente con raíces: ${Array.from(rootCubesInMeasures).join(', ')}`);
        for (const primaryCube of rootCubesInMeasures) {
          const splitQ: CubeQuery = {};

          splitQ.measures = q.measures?.filter((m: string) => m.startsWith(`${primaryCube}.`));
          splitQ.dimensions = q.dimensions?.filter((m: string) =>
            m.startsWith(`${primaryCube}.`) || !ROOT_CUBES.some(rc => rc !== primaryCube && m.startsWith(`${rc}.`))
          );
          splitQ.filters = q.filters?.filter((f: any) =>
            f.member && (f.member.startsWith(`${primaryCube}.`) || !ROOT_CUBES.some(rc => rc !== primaryCube && f.member.startsWith(`${rc}.`)))
          );
          splitQ.timeDimensions = q.timeDimensions?.filter((td: any) =>
            td.dimension && td.dimension.startsWith(`${primaryCube}.`)
          );
          splitQ.order = q.order;
          splitQ.limit = q.limit;

          if ((splitQ.measures && splitQ.measures.length > 0) || (splitQ.dimensions && splitQ.dimensions.length > 0)) {
            finalQueries.push(splitQ);
          }
        }
      } else {
        finalQueries.push(q);
      }
    }

    return finalQueries;
  }
}
