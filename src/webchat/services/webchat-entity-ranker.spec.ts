import {
  normalizeText,
  rankEntitiesByRelevance,
  MIN_ENTITY_MATCH_SCORE,
} from './webchat-entity-ranker.util';

describe('WebchatEntityRankerUtil', () => {
  describe('normalizeText', () => {
    it('debe remover acentos y caracteres diacríticos correctamente', () => {
      expect(normalizeText('Grupo méxico')).toBe('grupo mexico');
      expect(normalizeText('JOSÉ PÉREZ')).toBe('jose perez');
      expect(normalizeText('Álvaro-González S.A. de C.V.')).toBe('alvaro gonzalez s a de c v');
      expect(normalizeText('Pingüino & Compañía')).toBe('pinguino compania');
    });

    it('debe manejar nulos, indefinidos y cadenas vacías', () => {
      expect(normalizeText(null)).toBe('');
      expect(normalizeText(undefined)).toBe('');
      expect(normalizeText('   ')).toBe('');
    });
  });

  describe('rankEntitiesByRelevance', () => {
    it('debe priorizar coincidencia exacta normalizada por encima de coincidencias parciales', () => {
      const candidates = [
        { id: '1', nombre: 'Transportes Mexico' },
        { id: '2', nombre: 'Grupo méxico' },
        { id: '3', nombre: 'Grupo Bimbo' },
      ];

      const scored = rankEntitiesByRelevance(
        candidates,
        'grupo mexico',
        c => [c.nombre],
      );

      expect(scored.length).toBeGreaterThan(0);
      expect(scored[0].item.nombre).toBe('Grupo méxico');
      expect(scored[0].score).toBeGreaterThanOrEqual(10000);

      // Transportes Mexico solo tiene la palabra 'mexico', debe quedar con puntuación baja o ser filtrada
      const transportes = scored.find(s => s.item.nombre === 'Transportes Mexico');
      if (transportes) {
        expect(scored[0].score).toBeGreaterThan(transportes.score);
        expect(transportes.score).toBeLessThan(MIN_ENTITY_MATCH_SCORE);
      }
    });

    it('debe resolver personas individuales ignorando acentos en nombre y apellido', () => {
      const candidates = [
        { id: '1', nombre: 'José', apellido: 'Pérez' },
        { id: '2', nombre: 'Juan', apellido: 'Pérez' },
        { id: '3', nombre: 'José', apellido: 'Martínez' },
      ];

      const scored = rankEntitiesByRelevance(
        candidates,
        'jose perez',
        c => [`${c.nombre} ${c.apellido}`, c.nombre, c.apellido],
      );

      expect(scored[0].item.nombre).toBe('José');
      expect(scored[0].item.apellido).toBe('Pérez');
      expect(scored[0].score).toBeGreaterThanOrEqual(10000);
    });

    it('debe penalizar severamente cuando faltan términos clave de una búsqueda de múltiples palabras', () => {
      const candidates = [
        { id: '1', nombre: 'Pinturas del Norte de Mexico' },
      ];

      const scored = rankEntitiesByRelevance(
        candidates,
        'grupo mexico',
        c => [c.nombre],
      );

      // Falta 'grupo', solo coincide 'mexico'
      if (scored.length > 0) {
        expect(scored[0].score).toBeLessThan(MIN_ENTITY_MATCH_SCORE);
      }
    });

    it('debe tolerar errores ortográficos reales menores (Damerau-Levenshtein)', () => {
      const candidates = [
        { id: '1', nombre: 'Grupo méxico' },
        { id: '2', nombre: 'Transportes Mexico' },
      ];

      // Caso A: letra faltante ('mexco' -> 'mexico')
      const scoredA = rankEntitiesByRelevance(
        candidates,
        'grupo mexco',
        c => [c.nombre],
      );
      expect(scoredA.length).toBeGreaterThan(0);
      expect(scoredA[0].item.nombre).toBe('Grupo méxico');
      expect(scoredA[0].score).toBeGreaterThanOrEqual(MIN_ENTITY_MATCH_SCORE);

      // Caso B: transposición de letras ('bimob' -> 'bimbo')
      const candidatesB = [{ id: '1', nombre: 'Grupo Bimbo' }];
      const scoredB = rankEntitiesByRelevance(
        candidatesB,
        'bimob',
        c => [c.nombre],
      );
      expect(scoredB.length).toBeGreaterThan(0);
      expect(scoredB[0].item.nombre).toBe('Grupo Bimbo');
      expect(scoredB[0].score).toBeGreaterThanOrEqual(MIN_ENTITY_MATCH_SCORE);

      // Caso C: sustitución fonética ('peres' -> 'perez')
      const candidatesC = [{ id: '1', nombre: 'José', apellido: 'Pérez' }];
      const scoredC = rankEntitiesByRelevance(
        candidatesC,
        'jose peres',
        c => [`${c.nombre} ${c.apellido}`, c.nombre, c.apellido],
      );
      expect(scoredC.length).toBeGreaterThan(0);
      expect(scoredC[0].item.nombre).toBe('José');
      expect(scoredC[0].score).toBeGreaterThanOrEqual(MIN_ENTITY_MATCH_SCORE);
    });

    it('no debe otorgar bonus de substring inverso a nombres cortos en búsquedas compuestas (H2)', () => {
      const candidates = [
        { id: '1', nombre: 'Juan', apellido: 'López' },
      ];

      // El usuario busca a "Juan Carlos Pérez" (no existe en BD)
      const scored = rankEntitiesByRelevance(
        candidates,
        'Juan Carlos Pérez',
        c => [`${c.nombre} ${c.apellido}`, c.nombre, c.apellido],
      );

      // No debe ser asignado como match confiable solo porque 'Juan' está contenido en la búsqueda
      if (scored.length > 0) {
        expect(scored[0].score).toBeLessThan(MIN_ENTITY_MATCH_SCORE);
      }
    });
  });
});
