/**
 * Normaliza una cadena de texto para comparaciones semánticas e insensibilidad a tildes:
 * - Convierte a minúsculas.
 * - Descompone caracteres diacríticos (Unicode NFD).
 * - Elimina tildes y signos diacríticos ([\u0300-\u036f]).
 * - Reemplaza signos de puntuación y caracteres especiales no alfanuméricos por espacios.
 * - Colapsa espacios redundantes.
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Expresión SQL nativa de PostgreSQL para traducir caracteres acentuados comunes a sus contrapartes sin acento.
 * Utiliza la función inmutable indexada public.f_unaccent_immutable para aprovechar los índices funcionales.
 */
export const PG_TRANSLATE_EXPRESSION = (columnExpr: string) =>
  `public.f_unaccent_immutable(${columnExpr})`;

/**
 * Conjunto de stopwords corporativas y conectores gramaticales para filtrado de candidatos en CRM.
 */
export const CRM_ENTITY_STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'e', 'para', 'con',
  'sa', 'cv', 'sapi', 'sc', 'rl', 'cia', 'compania', 'corporativo',
  'sociedad', 'anonima', 'capital', 'variable',
]);

/**
 * Calcula la distancia de Damerau-Levenshtein entre dos cadenas,
 * contemplando inserción, eliminación, sustitución y transposición adyacente.
 */
export function damerauLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const al = a.length;
  const bl = b.length;
  const d: number[][] = [];

  for (let i = 0; i <= al; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= bl; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,        // eliminación
        d[i][j - 1] + 1,        // inserción
        d[i - 1][j - 1] + cost, // sustitución
      );

      // Transposición (Damerau)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[al][bl];
}

/**
 * Determina si dos palabras coinciden considerando typos ortográficos menores:
 * - Longitud <= 3: no se permiten typos (debe ser idéntica).
 * - Longitud 4 a 6: se permite distancia de edición de 1 (ej. mexco -> mexico, bimob -> bimbo, peres -> perez).
 * - Longitud >= 7: se permite distancia de edición de hasta 2 (ej. metropoltana -> metropolitana).
 */
export function isFuzzyWordMatch(wordA: string, wordB: string): boolean {
  if (wordA === wordB) return true;
  const maxLen = Math.max(wordA.length, wordB.length);
  const minLen = Math.min(wordA.length, wordB.length);
  if (maxLen - minLen > 2) return false;

  const allowedDist = maxLen <= 3 ? 0 : maxLen <= 6 ? 1 : 2;
  const dist = damerauLevenshteinDistance(wordA, wordB);
  return dist <= allowedDist;
}

export interface EntityScored<T> {
  item: T;
  score: number;
}

/**
 * Puntuación mínima para considerar que un candidato es un match confiable.
 * Evita que coincidencias accidentales de 1 sola palabra común (ej. "mexico", "grupo")
 * provoquen asignaciones erróneas.
 */
export const MIN_ENTITY_MATCH_SCORE = 2000;

/**
 * Margen de diferencia de puntuación mínimo entre el 1er y 2do candidato para
 * descartar ambigüedad. Si la diferencia es menor, se recomienda solicitar clarificación.
 */
export const AMBIGUITY_MARGIN_SCORE = 1500;

/**
 * Evalúa y ordena candidatos de entidades (Clientes o Empresas) con base en similitud semántica,
 * coincidencia exacta normalizada, inclusión de subcadenas, palabras clave y tolerancia a typos (Damerau-Levenshtein).
 *
 * @param candidates Lista de entidades candidatas recuperadas de base de datos.
 * @param searchText Texto buscado por el usuario (ej. "grupo mexico").
 * @param getTextFields Función que extrae los campos textuales relevantes de la entidad (ej. nombre, empresa, correo).
 * @returns Lista de candidatos ordenados de mayor a menor puntuación.
 */
export function rankEntitiesByRelevance<T>(
  candidates: T[],
  searchText: string,
  getTextFields: (item: T) => (string | null | undefined)[],
): EntityScored<T>[] {
  if (!candidates || candidates.length === 0) return [];
  const cleanSearch = normalizeText(searchText);
  if (!cleanSearch) return [];

  const searchWords = cleanSearch.split(/\s+/).filter(w => w.length >= 2);
  const nonStopSearchWords = searchWords.filter(w => !CRM_ENTITY_STOPWORDS.has(w));
  const effectiveSearchWords = nonStopSearchWords.length > 0 ? nonStopSearchWords : searchWords;

  const scored: EntityScored<T>[] = [];

  for (const item of candidates) {
    const rawFields = (getTextFields(item) || []).filter((f): f is string => Boolean(f));
    let bestFieldScore = 0;

    for (const rawField of rawFields) {
      const cleanField = normalizeText(rawField);
      if (!cleanField) continue;

      let score = 0;

      // 1. Coincidencia exacta de la cadena completa normalizada
      if (cleanField === cleanSearch) {
        score += 10000;
      }
      // 2A. Coincidencia de subcadena: el campo contiene la búsqueda completa
      // (ej. "Grupo México S.A. de C.V." contiene "grupo mexico")
      else if (cleanField.includes(cleanSearch)) {
        const lengthDiff = Math.abs(cleanField.length - cleanSearch.length);
        score += Math.max(1000, 5000 - lengthDiff * 25);
      }
      // 2B. Coincidencia de subcadena inversa: la búsqueda contiene el campo
      // (SOLO si el campo cubre al menos el 70% de la búsqueda o la búsqueda es de 1 sola palabra,
      // para evitar que "Juan Carlos Pérez" asigne indebidamente a "Juan López")
      else if (cleanSearch.includes(cleanField) && (cleanField.length >= cleanSearch.length * 0.7 || searchWords.length <= 1)) {
        const lengthDiff = Math.abs(cleanField.length - cleanSearch.length);
        score += Math.max(500, 3000 - lengthDiff * 30);
      }

      // 3. Coincidencia de palabras clave y tolerancia a typos (Damerau-Levenshtein)
      const fieldWords = cleanField.split(/\s+/).filter(w => w.length >= 2);
      const fieldWordSet = new Set(fieldWords);

      let matchedWords = 0;
      for (const sw of effectiveSearchWords) {
        if (fieldWordSet.has(sw)) {
          matchedWords++;
          score += 350;
        } else if (fieldWords.some(fw => fw.includes(sw) || sw.includes(fw))) {
          matchedWords += 0.8;
          score += 200;
        } else if (fieldWords.some(fw => isFuzzyWordMatch(sw, fw))) {
          // Coincidencia difusa por error ortográfico (ej. mexco -> mexico, bimob -> bimbo)
          matchedWords += 0.8;
          score += 220;
        }
      }

      // Bonus si todas las palabras clave buscadas están presentes en el campo
      if (effectiveSearchWords.length > 0 && matchedWords >= effectiveSearchWords.length * 0.8) {
        score += 2500;
      } else if (effectiveSearchWords.length > 1 && matchedWords < effectiveSearchWords.length * 0.5) {
        // Penalización si faltaron términos clave importantes de la búsqueda
        const missingWords = effectiveSearchWords.length - matchedWords;
        score -= missingWords * 500;
      }

      if (score > bestFieldScore) {
        bestFieldScore = score;
      }
    }

    if (bestFieldScore > 0) {
      scored.push({ item, score: bestFieldScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
