/**
 * Utilidades compartidas para normalización de transcripciones de voz (STT) en español
 * y extracción limpia de montos, conceptos y usuarios/ejecutivos en flujos de gastos.
 */

const SPURIOUS_STT_CURRENCY_REGEX = /[₽₱₹₩₴₸₺₼₾]/g;

const SPOKEN_PROSE_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'a', 'por', 'para', 'con', 'sin', 'sobre',
  'y', 'o', 'un', 'una', 'unos', 'unas', 'final', 'clave', 'vista', 'venta', 'ventas',
  'medio', 'muerto', 'alto', 'bajo', 'blanco', 'negro', 'exacto', 'comun', 'común',
  'critico', 'crítico', 'inicial', 'fijo', 'extra',
]);

const GENERIC_EXPENSE_CONCEPT_REGEX =
  /^(?:(?:crea(?:r)?|registra(?:r)?|apunta(?:r)?|anota(?:r)?|carga(?:r)?|captura(?:r)?|agrega(?:r)?|genera(?:r)?|nuev[oa])\s+)?(?:un\s+|una\s+|unos\s+|unas\s+)?(?:nuev[oa]\s+)?(?:gastos?|vi[aá]ticos?|reembolsos?)$/i;

function normalizeIdentifierJoiners(fragment: string): string {
  let out = fragment
    .replace(/\s+arroba\s+/gi, '@')
    .replace(/(\S+)\s+guion\s+bajo\s+(\S+)/gi, '$1_$2')
    .replace(/(\S+)\s+guion\s+(\S+)/gi, '$1-$2');

  // Iterar para soportar múltiples puntos en secuencia (ej. "a punto b punto com")
  for (let pass = 0; pass < 4; pass++) {
    const next = out.replace(
      /([a-záéíóúüñ0-9@._-]+)\s+punto\s+([a-záéíóúüñ0-9_-]+)/gi,
      (_m, left: string, right: string) => {
        const lLow = left.toLowerCase();
        const rLow = right.toLowerCase();
        if (SPOKEN_PROSE_STOPWORDS.has(lLow) || SPOKEN_PROSE_STOPWORDS.has(rLow)) {
          return _m;
        }
        return `${left}.${right}`;
      },
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Normaliza transcripciones de voz en español:
 * 1. Corrige símbolos monetarios extranjeros alucinados por IBM Watson STT (₽, ₱, ₹, etc. -> $).
 * 2. Convierte separadores hablados de correos, dominios y usernames ("arroba", "punto", "guion bajo", "guion")
 *    tanto en correos como en usernames/dominios tras palabras clave o respuestas aisladas, sin alterar prosa común ("en punto", "punto de venta").
 * 3. Convierte secuencias de números dictados por voz (7 a 15 dígitos) a formato numérico continuo para teléfonos.
 */
export function normalizeSpokenSpanishText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let result = text.trim().replace(SPURIOUS_STT_CURRENCY_REGEX, '$');

  // Normalizar frases con "arroba" completo (correos dictados)
  if (/\barroba\b/i.test(result)) {
    result = normalizeIdentifierJoiners(
      result
        .replace(/(\S+)\s+guion\s+bajo\s+(\S+)/gi, '$1_$2')
        .replace(/(\S+)\s+guion\s+(\S+)/gi, '$1-$2'),
    );
  } else {
    // 1. Dominios / extensiones explícitas ("empresa acme punto com punto mx")
    for (let pass = 0; pass < 3; pass++) {
      const next = result.replace(
        /([a-záéíóúüñ0-9_-]+)\s+punto\s+(com\.mx|com|mx|net|org|io|ai|edu|gob|es|co|dev|app)\b/gi,
        '$1.$2',
      );
      if (next === result) break;
      result = next;
    }

    // 2. Identificadores precedidos por etiqueta de usuario/correo/sitio ("el nombre del usuario es marco punto tráfico")
    result = result.replace(
      /\b((?:(?:el\s+)?nombre\s+del?\s+|de\s+|del\s+|el\s+)?(?:usuario|username|user|login|cuenta|correo|email|dominio|sitio\s+web|web)(?:\s+(?:es|ser[ií]a|llamad[oa]|como))?\s+)([a-záéíóúüñ0-9_-]+(?:\s+(?:punto|guion\s+bajo|guion)\s+[a-záéíóúüñ0-9_-]+)+)/gi,
      (_m, prefix: string, handle: string) => `${prefix}${normalizeIdentifierJoiners(handle)}`,
    );

    // 3. Respuesta dictada aislada exclusivamente con un username/handle ("marco punto tráfico")
    if (
      /^[a-záéíóúüñ0-9_-]+(?:\s+(?:punto|guion\s+bajo|guion)\s+[a-záéíóúüñ0-9_-]+){1,3}$/i.test(result)
    ) {
      result = normalizeIdentifierJoiners(result);
    }
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
 * Convierte montos dictados en palabras en español a su valor numérico.
 */
export function parseSpokenSpanishAmount(text: string): number | null {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:pesos|mxn|usd|dolares|con|de|y)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
  if (!cleaned) return null;

  const wordMap: Record<string, number> = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
    trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21,
    veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
    veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
    veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50,
    sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
    cien: 100, ciento: 100, doscientos: 200, doscientas: 200,
    trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
    quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
    setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
    novecientos: 900, novecientas: 900,
  };

  let total = 0;
  let current = 0;
  let matchedWord = false;

  for (const tok of cleaned.split(/\s+/)) {
    if (!tok) continue;
    if (/^\d+$/.test(tok)) {
      matchedWord = true;
      current += Number(tok);
    } else if (tok === 'mil') {
      matchedWord = true;
      total += (current === 0 ? 1 : current) * 1000;
      current = 0;
    } else if (tok === 'millon' || tok === 'millones') {
      matchedWord = true;
      total += (current === 0 ? 1 : current) * 1000000;
      current = 0;
    } else if (wordMap[tok] !== undefined) {
      matchedWord = true;
      current += wordMap[tok];
    }
  }

  return matchedWord ? total + current : null;
}

/**
 * Extrae el monto de una oración de gasto, tolerando símbolos de moneda alucinados por STT (₽ -> $).
 */
export function extractExpenseAmountFromText(rawText: string): number | null {
  if (!rawText) return null;
  const text = normalizeSpokenSpanishText(rawText);

  const m =
    text.match(/[$€£]\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    text.match(/\bmonto(?:\s+de)?\s*:?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)\b/i) ||
    text.match(
      /\b(?:de|por|a)\s+[$€£]?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:pesos|mxn|usd|d[oó]lares)?\b(?!\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b)/i,
    ) ||
    text.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:pesos|mxn|usd|d[oó]lares)\b/i);

  if (m && m[1]) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isNaN(n) && n > 0) return n;
  }

  const spokenPhraseMatch = text.match(
    /\b(?:por|de|monto(?:\s+de)?)\s+((?:(?:un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci\w+|veinti?\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien(?:to)?|doscient[oa]s|trescient[oa]s|cuatrocient[oa]s|quinient[oa]s|seiscient[oa]s|setecient[oa]s|ochocient[oa]s|novecient[oa]s|mil|mill[oó]n|millones)(?:\s+(?:y\s+)?)){1,6})(?=\s+(?:pesos|mxn|usd|en|para|con|el|la|hoy|ayer)|$|[,.])/i,
  );
  if (spokenPhraseMatch && spokenPhraseMatch[1]) {
    const parsedSpoken = parseSpokenSpanishAmount(spokenPhraseMatch[1]);
    if (parsedSpoken !== null && parsedSpoken > 0) return parsedSpoken;
  }

  return null;
}

/**
 * Extrae el username/nombre del usuario o ejecutivo asignado desde la frase del gasto.
 * Preserva puntos internos en usernames (ej. "marco.trafico").
 */
export function extractExpenseUserFromText(rawText: string): { usuario?: string; ejecutivo?: string } {
  if (!rawText) return {};
  const q = normalizeSpokenSpanishText(rawText);
  const res: { usuario?: string; ejecutivo?: string } = {};

  const execMatch = q.match(
    /\b(?:para\s+el\s+|asignad[oa]\s+(?:a|al)\s+)?ejecutivo\s+["']?((?:[^,;"'\n]|\.(?=\S))+?)["']?(?=\s+(?:por|de\s+[$€£]?\d|con\s+(?:un\s+)?monto|monto|fecha|hoy|ayer|anteayer|antier|cliente|oportunidad)|[.,;](?:\s|$)|$)/i,
  );
  if (execMatch && execMatch[1]) {
    const cand = execMatch[1].trim();
    if (cand.length >= 2 && !/^(es|de|del|el|la|nuevo)$/i.test(cand)) {
      res.ejecutivo = cand;
    }
  }

  const userMatch = q.match(
    /\b(?:(?:el\s+)?nombre\s+del?\s+|para\s+el\s+|asignad[oa]\s+(?:a|al)\s+|del\s+|al?\s+)?usuario(?:\s+(?:es|ser[ií]a|llamad[oa]|como))?\s*:?\s*["']?((?:[^,;"'\n]|\.(?=\S))+?)["']?(?=\s+(?:por|de\s+[$€£]?\d|con\s+(?:un\s+)?monto|monto|fecha|hoy|ayer|anteayer|antier|cliente|oportunidad|para\s+(?:el\s+cliente|la\s+oportunidad)|en\s+(?:la\s+)?oportunidad)|[.,;](?:\s|$)|$)/i,
  );
  if (userMatch && userMatch[1]) {
    const cand = userMatch[1].trim().replace(/^(?:es|como)\s+/i, '').trim();
    if (cand.length >= 2 && !/^(nuevo|es|de|del|el|la|un|una|que|no)$/i.test(cand)) {
      res.usuario = cand;
    }
  }

  return res;
}

/**
 * Determina si un candidato a concepto de gasto es en realidad un placeholder genérico o texto corrupto.
 */
export function isInvalidOrGenericExpenseConcept(concept: string | null | undefined): boolean {
  if (!concept) return true;
  const trimmed = concept.trim();
  if (trimmed.length < 2) return true;
  if (/^\s*[$€£₽]?\d+(?:[.,]\d{1,2})?\s*(?:pesos|mxn|usd)?\s*$/i.test(trimmed)) return true;
  if (GENERIC_EXPENSE_CONCEPT_REGEX.test(trimmed)) return true;
  if (/[₽₱₹₩₴₸₺₼₾]/.test(trimmed)) return true;
  if (/^(?:l|el|la|del|al)\s+(?:usuario|ejecutivo|cliente)\b/i.test(trimmed)) return true;
  if (/\bcon\s+un\s+monto\s+de\b/i.test(trimmed)) return true;
  return false;
}

/**
 * Limpia y extrae el concepto real de una frase de creación de gasto.
 * Previene amputar preposiciones internas (ej. "del" -> "l"), restos de símbolos STT (₽)
 * y cláusulas de usuario/ejecutivo/monto.
 */
export function extractExpenseConceptFromText(rawText: string): string | null {
  if (!rawText) return null;
  const text = normalizeSpokenSpanishText(rawText).trim();
  if (GENERIC_EXPENSE_CONCEPT_REGEX.test(text)) {
    return null;
  }

  if (!/\b(crea(?:r)?|registra(?:r)?|apunta(?:r)?|anota(?:r)?|carga(?:r)?|captura(?:r)?|agrega(?:r)?|genera(?:r)?|gastos?|vi[aá]ticos?|reembolsos?)\b/i.test(text)) {
    return null;
  }

  const explicit = text.match(
    /\bconcepto\s*:?\s*["']?([^,.;"'\n]+?)["']?(?=\s+(?:monto|por\s+[$€£]?\d|de\s+[$€£]?\d|con\s+(?:un\s+)?monto|fecha|hoy|ayer|cliente|oportunidad|usuario|ejecutivo)|$|[,.])/i,
  );
  if (explicit && explicit[1]) {
    const expClean = explicit[1].trim();
    return isInvalidOrGenericExpenseConcept(expClean) ? null : expClean;
  }

  const cleaned = text
    .replace(
      /^(?:crea(?:r)?|registra(?:r)?|apunta(?:r)?|anota(?:r)?|carga(?:r)?|captura(?:r)?|agrega(?:r)?|genera(?:r)?)\s+(?:un\s+|una\s+|unos\s+|el\s+)?(?:nuev[oa]\s+)?(?:gastos?|vi[aá]ticos?|reembolsos?)(?=\s|$)(?:\s+(?:de|por|en)\b\s*)?/i,
      '',
    )
    .replace(
      /\b(?:con\s+(?:un\s+)?|por\s+(?:un\s+)?)?monto(?:\s+de)?\s*:?\s*[$€£]?\s*[\d,]+(?:\.\d{1,2})?\s*(?:pesos|mxn|usd|d[oó]lares)?\b/gi,
      ' ',
    )
    .replace(/[$€£]?\s*[\d,]+(?:\.\d{1,2})?\s*(?:pesos|mxn|usd|d[oó]lares)?/gi, ' ')
    .replace(/\b(?:para\s+la\s+|de\s+la\s+|a\s+la\s+|en\s+la\s+)?(?:oportunidad|cotizaci[oó]n|proyecto)\s+(?:[^,;\n]|\.(?=\S))+/gi, ' ')
    .replace(/\b(?:para\s+el\s+|del\s+|con\s+(?:el\s+)?|al?\s+)cliente\s+(?:[^,;\n]|\.(?=\S))+/gi, ' ')
    .replace(
      /\b(?:(?:el\s+)?nombre\s+del?\s+|para\s+el\s+|asignad[oa]\s+(?:a|al)\s+|del\s+|al?\s+|con\s+(?:el\s+)?)?(?:ejecutivo|usuario)(?:\s+(?:es|ser[ií]a|llamad[oa]|como))?\s+(?:[^,;\n]|\.(?=\S))+/gi,
      ' ',
    )
    .replace(
      /\b(?:fecha(?:\s+(?:del|a|para|en|:))?\s*)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|hoy|ayer|anteayer|antier|hace\s+\d+\s+d[ií]as?|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?|(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+pasado)\b/gi,
      ' ',
    )
    .replace(/[$€£₽₱₹]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:de|del|por|en|con|para|al|y)\s+/i, '')
    .replace(/\s+(?:de|por|en|con|para|a|del|al|y)$/i, '')
    .trim();

  if (!cleaned || isInvalidOrGenericExpenseConcept(cleaned)) {
    return null;
  }
  return cleaned;
}
