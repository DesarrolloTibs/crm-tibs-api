import { WebchatQueryPlannerService } from './webchat-query-planner.service';
import { WebchatPromptBuilderService } from './webchat-prompt-builder.service';

describe('WebchatQueryPlannerService & PromptBuilder - Módulo de Gastos', () => {
  let planner: WebchatQueryPlannerService;
  let promptBuilder: WebchatPromptBuilderService;
  let mockAiAgentService: any;
  let mockEntityMatcher: any;

  beforeEach(() => {
    mockAiAgentService = {
      generateJson: jest.fn(),
      sanitizeJsonOutput: jest.fn((raw: string) => raw),
    };
    mockEntityMatcher = {
      resolveCanonicalSearchTerm: jest.fn().mockResolvedValue(null),
      isVagueQuery: jest.fn().mockReturnValue(false),
    };
    planner = new WebchatQueryPlannerService(mockAiAgentService, mockEntityMatcher);
    promptBuilder = new WebchatPromptBuilderService();
  });

  describe('inferActionTypeFromQuestion (Prioridad Gastos vs Oportunidades/Clientes)', () => {
    it('debe clasificar como createExpense aunque mencione "para la oportunidad Red Magic"', () => {
      expect(
        planner.inferActionTypeFromQuestion('registra un gasto de 500 para la oportunidad Red Magic'),
      ).toBe('createExpense');
    });

    it('debe clasificar como createExpense para viáticos vinculados a cliente', () => {
      expect(
        planner.inferActionTypeFromQuestion('apunta viáticos de 1200 de vuelos con el cliente Carlos'),
      ).toBe('createExpense');
    });

    it('debe clasificar como modifyExpense aunque contenga la palabra "monto"', () => {
      expect(
        planner.inferActionTypeFromQuestion('actualiza el monto del gasto de comida a 650'),
      ).toBe('modifyExpense');
      expect(
        planner.inferActionTypeFromQuestion('corrige el gasto de comida a 650'),
      ).toBe('modifyExpense');
      expect(
        planner.inferActionTypeFromQuestion('reasigna el gasto de comida al cliente Carlos'),
      ).toBe('modifyExpense');
    });

    it('no debe secuestrar creación explícita de oportunidad o ticket aunque mencione "gastos"', () => {
      expect(
        planner.inferActionTypeFromQuestion('crea un ticket de soporte por falla en gastos'),
      ).toBe('createTicket');
      expect(
        planner.inferActionTypeFromQuestion('crea una oportunidad para Proyecto de Gastos'),
      ).toBe('createOpportunity');
    });

    it('debe clasificar correctamente createProduct, modifyProduct y modifyTicket', () => {
      expect(
        planner.inferActionTypeFromQuestion('crea un producto llamado Sutura Nylon 6-0 con precio 180'),
      ).toBe('createProduct');
      expect(
        planner.inferActionTypeFromQuestion('actualiza el precio del producto Sutura Nylon 6-0 a 220'),
      ).toBe('modifyProduct');
      expect(
        planner.inferActionTypeFromQuestion('mueve el ticket #12 a la etapa En Proceso'),
      ).toBe('modifyTicket');
      expect(
        planner.inferActionTypeFromQuestion('resuelve el ticket #15 con notas Se reinició el servicio'),
      ).toBe('modifyTicket');
    });
  });

  describe('inferDomainFromQuestion (Consultas en Cube vs Mutaciones en ActionExecutor)', () => {
    it('debe mantener las consultas de lectura en el dominio GASTOS (capa semántica Cube)', () => {
      expect(planner.inferDomainFromQuestion('¿cuánto he gastado este mes?')).toBe('GASTOS');
      expect(planner.inferDomainFromQuestion('lista mis gastos por cliente')).toBe('GASTOS');
    });

    it('debe enrutar creaciones y modificaciones de gastos hacia ACTION_EXECUTION', () => {
      expect(planner.inferDomainFromQuestion('apunta un gasto de 300 de taxi con Carlos')).toBe('ACTION_EXECUTION');
      expect(planner.inferDomainFromQuestion('corrige el gasto de comida a 650')).toBe('ACTION_EXECUTION');
    });
  });

  describe('parseRouterClassification (Continuidad Multi-Turno en Gastos)', () => {
    it('debe mantener createExpense activo ante respuesta suelta cuando el asistente pidió cliente u oportunidad (XOR)', () => {
      const history = [
        { role: 'user' as const, content: 'registra un gasto de 500 de comida' },
        {
          role: 'assistant' as const,
          content:
            '⚠️ Todo gasto debe asociarse a un cliente o a una oportunidad (no ambos).\n\n¿A qué cliente o oportunidad deseas asociar este gasto?',
        },
      ];

      const plan = planner.parseRouterClassification(
        'invalid-json-fallback',
        'Red Magic',
        history,
      );

      expect(plan.intent).toBe('ACTION_EXECUTION');
      expect(plan.actionPlan?.action).toBe('createExpense');
    });

    it('debe mantener modifyExpense activo tras lista ambigua de gastos', () => {
      const history = [
        { role: 'user' as const, content: 'cambia el monto del gasto de comida a 650' },
        {
          role: 'assistant' as const,
          content:
            '🤔 Encontré varios gastos que coinciden con "comida". ¿Cuál deseas modificar?\n\n1. Comida — $500.00 MXN',
        },
      ];

      const plan = planner.parseRouterClassification(
        '{"intent":"ACTION_EXECUTION","domain":"ACTION_EXECUTION","actionPlan":{"action":"modifyExpense","parameters":{}}}',
        'el 2',
        history,
      );

      expect(plan.intent).toBe('ACTION_EXECUTION');
      expect(plan.actionPlan?.action).toBe('modifyExpense');
    });

    it('debe permitir modificar el gasto recién creado sin secuestrar preguntas analíticas siguientes', () => {
      const history = [
        { role: 'user' as const, content: 'registra gasto de 500 comida cliente Carlos' },
        {
          role: 'assistant' as const,
          content: '✅ Gasto Registrado Exitosamente\n\n- Concepto: Comida\n- Monto: $500.00 MXN',
        },
      ];

      const modifyFollowUp = planner.parseRouterClassification(
        '{"intent":"CONVERSATIONAL","domain":"CONVERSATIONAL"}',
        'el monto era 650',
        history,
      );
      expect(modifyFollowUp.intent).toBe('ACTION_EXECUTION');
      expect(modifyFollowUp.actionPlan?.action).toBe('modifyExpense');

      const analyticalFollowUp = planner.parseRouterClassification(
        '{"intent":"ANALYTICAL","domain":"GASTOS"}',
        '¿cuánto he gastado este mes?',
        history,
      );
      expect(analyticalFollowUp.intent).toBe('ANALYTICAL');
      expect(analyticalFollowUp.domain).toBe('GASTOS');
    });

    it('debe soportar flujo AI-First y fallback heurístico multi-turno para createProduct sin secuestrar preguntas analíticas', () => {
      // 1. AI-First: LLM clasifica "nuevo producto" como createProduct
      const turn1Plan = planner.parseRouterClassification(
        JSON.stringify({
          thought: 'Alta de producto sin nombre especificado',
          intent: 'ACTION_EXECUTION',
          domain: 'ACTION_EXECUTION',
          actionPlan: { action: 'createProduct', parameters: {} },
        }),
        'nuevo producto',
        [],
      );
      expect(turn1Plan.intent).toBe('ACTION_EXECUTION');
      expect(turn1Plan.actionPlan?.action).toBe('createProduct');
      expect(turn1Plan.thought).not.toContain('Recuperación');

      // 2. Turno 2 tras solicitud de nombre: usuario responde con nombre y precio aunque el LLM responda VAGUE_SEARCH
      const historyAfterAsk = [
        { role: 'user' as const, content: 'nuevo producto' },
        {
          role: 'assistant' as const,
          content: 'Para registrar un nuevo producto en el catálogo, por favor indícame al menos su Nombre.',
        },
      ];

      const turn2Fallback = planner.parseRouterClassification(
        JSON.stringify({ intent: 'VAGUE_SEARCH', domain: 'VAGUE_SEARCH', canonicalSearchTerm: 'Monitor Dell' }),
        'Monitor Dell 27 precio 4500',
        historyAfterAsk,
      );
      expect(turn2Fallback.intent).toBe('ACTION_EXECUTION');
      expect(turn2Fallback.actionPlan?.action).toBe('createProduct');
      expect(turn2Fallback.actionPlan?.parameters?.nombre).toBe('Monitor Dell 27');
      expect(turn2Fallback.actionPlan?.parameters?.precioBase).toBe(4500);

      // 3. Si el usuario cambia de tema a una consulta analítica de productos, NO debe secuestrarlo
      const analyticalSwitch = planner.parseRouterClassification(
        JSON.stringify({ intent: 'ANALYTICAL', domain: 'PRODUCTOS' }),
        'qué productos tenemos en el catálogo',
        historyAfterAsk,
      );
      expect(analyticalSwitch.intent).toBe('ANALYTICAL');
      expect(analyticalSwitch.domain).toBe('PRODUCTOS');
      expect(analyticalSwitch.actionPlan).toBeNull();
    });
  });

  describe('WebchatPromptBuilderService.buildRouterPrompt', () => {
    it('debe incluir createExpense, modifyExpense, createProduct, modifyProduct y modifyTicket y mantenerse menor a 5000 caracteres', () => {
      const routerPrompt = promptBuilder.buildRouterPrompt('u-1', 'executive', 'carlos');
      expect(routerPrompt).toContain('createExpense');
      expect(routerPrompt).toContain('modifyExpense');
      expect(routerPrompt).toContain('createProduct');
      expect(routerPrompt).toContain('modifyProduct');
      expect(routerPrompt).toContain('modifyTicket');
      expect(routerPrompt.length).toBeLessThan(5000);
    });
  });
});

