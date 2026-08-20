import { WebchatResponseFormatterService } from './webchat-response-formatter.service';
import { WebchatPromptBuilderService } from './webchat-prompt-builder.service';
import { WebchatSecurityService } from './webchat-security.service';
import { WebchatEntityMatcherService } from './webchat-entity-matcher.service';
import { CubeAnnotation, CubeQueryPlan } from '../interfaces/webchat.interfaces';

describe('Webchat Semantic Layer Updates & Formatter Suite', () => {
  describe('WebchatResponseFormatterService - Currency & Formatting', () => {
    let formatterService: WebchatResponseFormatterService;
    const mockAiAgentService: any = {
      invokeLanguageModel: jest.fn(),
    };
    const mockStageRepo: any = {
      findOne: jest.fn(),
    };
    const mockTicketStageRepo: any = {
      findOne: jest.fn(),
    };

    beforeEach(() => {
      formatterService = new WebchatResponseFormatterService(
        mockAiAgentService,
        mockStageRepo,
        mockTicketStageRepo,
      );
    });

    it('should detect currency fields using Cube.dev annotation metadata', () => {
      const annotation: CubeAnnotation = {
        measures: {
          'Oportunidades.montoTotalSum': {
            format: 'currency',
            type: 'number',
          },
          'Oportunidades.montoTotalMxnSum': {
            format: 'currency',
            type: 'number',
          },
          'Gastos.montoPromedio': {
            format: 'currency',
            type: 'number',
          },
          'Tickets.count': {
            type: 'number',
          },
        },
        dimensions: {
          'Productos.precioBase': {
            format: 'currency',
            type: 'number',
          },
          'Empresas.nombre': {
            type: 'string',
          },
        },
      };

      expect(formatterService.isCurrencyField('Oportunidades.montoTotalSum', annotation)).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoTotalMxnSum', annotation)).toBe(true);
      expect(formatterService.isCurrencyField('Gastos.montoPromedio', annotation)).toBe(true);
      expect(formatterService.isCurrencyField('Productos.precioBase', annotation)).toBe(true);
      expect(formatterService.isCurrencyField('Tickets.count', annotation)).toBe(false);
      expect(formatterService.isCurrencyField('Empresas.nombre', annotation)).toBe(false);
    });

    it('should detect currency fields via fallback heuristics when annotation is absent', () => {
      expect(formatterService.isCurrencyField('montoTotalSum')).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoTotalMxnSum')).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoLicenciamientoMxnSum')).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoServiciosMxnSum')).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoPromedioMxn')).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoPromedio')).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoMax')).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoMin')).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoLicenciamientoSum')).toBe(true);
      expect(formatterService.isCurrencyField('Oportunidades.montoServiciosSum')).toBe(true);
      expect(formatterService.isCurrencyField('Productos.precioBaseAvg')).toBe(true);
      expect(formatterService.isCurrencyField('Gastos.montoSum')).toBe(true);
      expect(formatterService.isCurrencyField('monto')).toBe(true);
      expect(formatterService.isCurrencyField('precioBase')).toBe(true);

      // Non-monetary fields
      expect(formatterService.isCurrencyField('Tickets.count')).toBe(false);
      expect(formatterService.isCurrencyField('Oportunidades.count')).toBe(false);
      expect(formatterService.isCurrencyField('Clientes.nombre')).toBe(false);
      expect(formatterService.isCurrencyField('Tickets.ticketNumber')).toBe(false);
      expect(formatterService.isCurrencyField('Oportunidades.createdAt')).toBe(false);
      expect(formatterService.isCurrencyField('Etapas.stageType')).toBe(false);
    });

    it('should format numbers correctly as Mexican Pesos (MXN) and US Dollars (USD)', () => {
      const formattedMxn = formatterService.formatCurrency(125000, 'MXN');
      expect(formattedMxn).toMatch(/\$125,000(\.00)?/);
      expect(formattedMxn).toContain('MXN');

      const formattedUsd = formatterService.formatCurrency(100, 'USD');
      expect(formattedUsd).toMatch(/\$100(\.00)?/);
      expect(formattedUsd).toContain('USD');

      const formattedDecimalUsd = formatterService.formatCurrency(1500.5, 'USD');
      expect(formattedDecimalUsd).toMatch(/\$1,500\.50/);
      expect(formattedDecimalUsd).toContain('USD');

      const formattedZero = formatterService.formatCurrency(0, 'USD');
      expect(formattedZero).toMatch(/\$0\.00/);
      expect(formattedZero).toContain('USD');

      const formattedNull = formatterService.formatCurrency(null, 'MXN');
      expect(formattedNull).toBe('$0.00 MXN');
    });

    it('should interpolate nominal USD opportunity in simpleFormat with responseTemplate', () => {
      const data = [
        {
          'Oportunidades.nombreProyecto': 'Comentario prueba',
          'Oportunidades.montoTotal': 100,
          'Oportunidades.moneda': 'USD',
        },
      ];
      const template = 'La oportunidad {Oportunidades.nombreProyecto} tiene un valor de {Oportunidades.montoTotal}.';
      const result = formatterService.simpleFormat(data, template);

      expect(result).toMatch(/La oportunidad Comentario prueba tiene un valor de \$100(\.00)? USD\./);
    });

    it('should interpolate normalized MXN measure in simpleFormat with responseTemplate', () => {
      const data = [{ 'Oportunidades.montoTotalMxnSum': 500000 }];
      const template = 'El total consolidado de ventas ganadas es {Oportunidades.montoTotalMxnSum}.';
      const result = formatterService.simpleFormat(data, template);

      expect(result).toMatch(/El total consolidado de ventas ganadas es \$500,000(\.00)? MXN\./);
    });

    it('should format multiple rows with respective currencies (USD vs MXN)', () => {
      const data = [
        {
          'Oportunidades.nombreProyecto': 'Licenciamiento Cloud',
          'Oportunidades.montoTotal': 100,
          'Oportunidades.moneda': 'USD',
        },
        {
          'Oportunidades.nombreProyecto': 'Consultoría Local',
          'Oportunidades.montoTotal': 50000,
          'Oportunidades.moneda': 'MXN',
        },
      ];

      const result = formatterService.simpleFormat(data);
      expect(result).toContain('1. nombreProyecto: Licenciamiento Cloud — montoTotal: $100.00 USD — moneda: USD');
      expect(result).toContain('2. nombreProyecto: Consultoría Local — montoTotal: $50,000.00 MXN — moneda: MXN');
    });

    it('should generate smart summary for monetary results with USD opportunity', () => {
      const data = [
        {
          'Oportunidades.nombreProyecto': 'Comentario prueba',
          'Oportunidades.montoTotal': 100,
          'Oportunidades.moneda': 'USD',
        },
      ];
      const plan: CubeQueryPlan = { intent: 'ANALYTICAL' };
      const summary = formatterService.generateSmartSummary(data, 'cuanto vale la oportunidad Comentario prueba', plan);

      expect(summary).toMatch(/Se encontraron 1 registro con un monto total de \$100(\.00)? USD\./);
    });

    it('should generate smart summary for consolidated MXN sum', () => {
      const data = [
        { 'Oportunidades.montoTotalMxnSum': 150000 },
      ];
      const plan: CubeQueryPlan = { intent: 'ANALYTICAL' };
      const summary = formatterService.generateSmartSummary(data, 'ventas de este mes', plan);

      expect(summary).toMatch(/Se encontraron 1 registro con un monto total de \$150,000(\.00)? MXN\./);
    });

    it('should format multi-entity summary including Empresas', () => {
      const matches: any[] = [
        {
          entityType: 'Empresa',
          id: 'emp-1',
          title: 'Acme Corporation',
          subtitle: 'Correo: info@acme.com | Teléfono: 555-1234',
        },
        {
          entityType: 'Cliente',
          id: 'cli-1',
          title: 'Juan Pérez',
          subtitle: 'Correo: juan@acme.com',
        },
      ];

      const summary = formatterService.formatMultiEntitySummary('Acme', matches);
      expect(summary).toContain('Empresas (1):');
      expect(summary).toContain('• Acme Corporation — Correo: info@acme.com | Teléfono: 555-1234');
      expect(summary).toContain('Clientes (1):');
      expect(summary).toContain('• Juan Pérez — Correo: juan@acme.com');
    });

    it('should clean frontend table data removing UUIDs and technical status', () => {
      const rawData = [
        {
          'Oportunidades.id': 'uuid-123',
          'Oportunidades.nombreProyecto': 'CRM Upgrade',
          'Oportunidades.cuentaOCliente': 'Acme Corp',
          'Oportunidades.montoTotal': 75000,
          'Oportunidades.moneda': 'USD',
          'Oportunidades.stageId': 'uuid-stage',
          'Etapas.stageType': 1,
        },
      ];

      const clean = formatterService.cleanTableDataForFrontend(rawData);
      expect(clean[0]['Oportunidades.id']).toBeUndefined();
      expect(clean[0]['Oportunidades.stageId']).toBeUndefined();
      expect(clean[0]['Etapas.stageType']).toBeUndefined();
      expect(clean[0]['Oportunidades.nombreProyecto']).toBe('CRM Upgrade');
      expect(clean[0]['Oportunidades.cuentaOCliente']).toBe('Acme Corp');
      expect(clean[0]['Oportunidades.montoTotal']).toBe(75000);
      expect(clean[0]['Oportunidades.moneda']).toBe('USD');
    });
  });

  describe('WebchatPromptBuilderService - Schemas & Rules', () => {
    let promptBuilder: WebchatPromptBuilderService;

    beforeEach(() => {
      promptBuilder = new WebchatPromptBuilderService();
    });

    it('should build lightweight router prompt with all available domains', () => {
      const routerPrompt = promptBuilder.buildRouterPrompt('user-1', 'admin', 'Admin User');

      expect(routerPrompt).toContain('Agente Orquestador y Clasificador');
      expect(routerPrompt).toContain('"OPORTUNIDADES"');
      expect(routerPrompt).toContain('"TICKETS"');
      expect(routerPrompt).toContain('"CLIENTES_EMPRESAS"');
      expect(routerPrompt).toContain('"ACTIVIDADES"');
      expect(routerPrompt).toContain('"GASTOS"');
      expect(routerPrompt).toContain('"PRODUCTOS"');
      expect(routerPrompt).toContain('"VAGUE_SEARCH"');
      expect(routerPrompt).toContain('"CONVERSATIONAL"');
      expect(routerPrompt.length).toBeLessThan(4000); // Verify it is lightweight
    });

    it('should build specialized domain prompts without losing schema rules', () => {
      const oppPrompt = promptBuilder.buildDomainPrompt('OPORTUNIDADES', 'user-1', 'admin', 'Admin User');
      expect(oppPrompt).toContain('Sub-Agente Especialista en Ventas y Oportunidades');
      expect(oppPrompt).toContain('montoTotalMxnSum');
      expect(oppPrompt).toContain('Etapas.stageType');

      const ticketPrompt = promptBuilder.buildDomainPrompt('TICKETS', 'user-1', 'admin', 'Admin User');
      expect(ticketPrompt).toContain('Sub-Agente Especialista en Mesa de Ayuda y Soporte');
      expect(ticketPrompt).toContain('Tickets.ticketNumber');
      expect(ticketPrompt).toContain('EtapasTicket.stageType');

      const clientPrompt = promptBuilder.buildDomainPrompt('CLIENTES_EMPRESAS', 'user-1', 'admin', 'Admin User');
      expect(clientPrompt).toContain('Sub-Agente Especialista en Directorio de Clientes y Empresas');
      expect(clientPrompt).toContain('Empresas.nombre');
      expect(clientPrompt).toContain('Clientes.nombre');

      const actPrompt = promptBuilder.buildDomainPrompt('ACTIVIDADES', 'user-1', 'admin', 'Admin User');
      expect(actPrompt).toContain('Sub-Agente Especialista en Agenda y Actividades');
      expect(actPrompt).toContain('Actividades.actividad');
      expect(actPrompt).toContain('TiposActividad.nombre');

      const expPrompt = promptBuilder.buildDomainPrompt('GASTOS', 'user-1', 'admin', 'Admin User');
      expect(expPrompt).toContain('Sub-Agente Especialista en Finanzas y Gastos');
      expect(expPrompt).toContain('Gastos.montoSum');

      const prodPrompt = promptBuilder.buildDomainPrompt('PRODUCTOS', 'user-1', 'admin', 'Admin User');
      expect(prodPrompt).toContain('Sub-Agente Especialista en Catálogo de Productos y Servicios');
      expect(prodPrompt).toContain('Productos.precioBase');
    });

    it('should include Empresas schema and relationships in prompt', () => {
      const prompt = promptBuilder.buildSystemPrompt('user-1', 'admin', 'Admin User');

      expect(prompt).toContain('**Empresas** (tabla: companies');
      expect(prompt).toContain('Empresas.nombre');
      expect(prompt).toContain('Empresas.correo');
      expect(prompt).toContain('Empresas.telefono');
      expect(prompt).toContain('Empresas.website');
      expect(prompt).toContain('Oportunidades.cuentaOCliente');
    });

    it('should include multi-currency measures and conversion rules in prompt', () => {
      const prompt = promptBuilder.buildSystemPrompt('user-1', 'admin', 'Admin User');

      expect(prompt).toContain('montoTotalMxnSum');
      expect(prompt).toContain('montoLicenciamientoMxnSum');
      expect(prompt).toContain('montoServiciosMxnSum');
      expect(prompt).toContain('montoPromedioMxn');
      expect(prompt).toContain('tipoCambio');
      expect(prompt).toContain('moneda (USD o MXN)');
      expect(prompt).toContain('MULTI-MONEDA Y TOTALES CONSOLIDADOS');
      expect(prompt).toContain('DESGLOSE POR MONEDA');
    });

    it('should include stageType guidance for Oportunidades and Tickets', () => {
      const prompt = promptBuilder.buildSystemPrompt('user-1', 'admin', 'Admin User');

      expect(prompt).toContain('Etapas.stageType');
      expect(prompt).toContain('EtapasTicket.stageType');
      expect(prompt).toContain('0=Abierta/En Proceso/Pipeline, 1=Ganada/Venta Concretada/Cierre Exitoso, 2=Perdida/Cancelada');
      expect(prompt).toContain('0=Abierto/En Proceso/Pendiente, 1=Cerrado/Resuelto/Solucionado');
    });
  });

  describe('WebchatSecurityService - Tenant & Entity Security', () => {
    let securityService: WebchatSecurityService;

    beforeEach(() => {
      securityService = new WebchatSecurityService();
    });

    it('should recognize Empresas as allowed global tenant entity for executives', () => {
      const query = {
        dimensions: ['Empresas.nombre', 'Empresas.correo'],
        filters: [],
      };

      expect(() => {
        securityService.applySecurityFilters(query, '11111111-1111-1111-1111-111111111111', 'executive');
      }).not.toThrow();
    });

    it('should sanitize companyId in UUID filters', () => {
      const query = {
        filters: [
          {
            member: 'Oportunidades.companyId',
            operator: 'equals' as const,
            values: ['invalid-company-id-string'],
          },
          {
            member: 'Clientes.companyId',
            operator: 'equals' as const,
            values: ['22222222-2222-2222-2222-222222222222'],
          },
        ],
      };

      securityService.sanitizeFilters(query, '11111111-1111-1111-1111-111111111111', 'admin');

      // The invalid UUID filter should be stripped
      expect(query.filters).toHaveLength(1);
      expect(query.filters[0].member).toBe('Clientes.companyId');
      expect(query.filters[0].values).toEqual(['22222222-2222-2222-2222-222222222222']);
    });

    it('should transform string usernames in securityFields to Usuarios.username for Admin', () => {
      const query = {
        filters: [
          {
            member: 'Oportunidades.ejecutivoId',
            operator: 'equals' as const,
            values: ['Carlos'],
          },
        ],
      };

      securityService.sanitizeFilters(query, '11111111-1111-1111-1111-111111111111', 'admin');

      expect(query.filters).toHaveLength(1);
      expect(query.filters[0].member).toBe('Usuarios.username');
      expect(query.filters[0].operator).toBe('contains');
      expect(query.filters[0].values).toEqual(['Carlos']);
    });

    it('should replace placeholders in securityFields with admin userId when querying personal data', () => {
      const query = {
        filters: [
          {
            member: 'Oportunidades.ejecutivoId',
            operator: 'equals' as const,
            values: ['me'],
          },
        ],
      };

      securityService.sanitizeFilters(query, '11111111-1111-1111-1111-111111111111', 'admin');

      expect(query.filters).toHaveLength(1);
      expect(query.filters[0].member).toBe('Oportunidades.ejecutivoId');
      expect(query.filters[0].values).toEqual(['11111111-1111-1111-1111-111111111111']);
    });

    it('should strip Usuarios.* filters and force executive own userId for executives', () => {
      const query = {
        filters: [
          {
            member: 'Usuarios.username',
            operator: 'contains' as const,
            values: ['Carlos'],
          },
          {
            member: 'Oportunidades.ejecutivoId',
            operator: 'equals' as const,
            values: ['Carlos'],
          },
        ],
      };

      securityService.sanitizeFilters(query, '99999999-9999-9999-9999-999999999999', 'executive');

      expect(query.filters).toHaveLength(1);
      expect(query.filters[0].member).toBe('Oportunidades.ejecutivoId');
      expect(query.filters[0].values).toEqual(['99999999-9999-9999-9999-999999999999']);
    });

    it('should sanitize nested OR filters and support multi-entity search', () => {
      const query: any = {
        filters: [
          {
            or: [
              {
                member: 'Usuarios.username',
                operator: 'contains',
                values: ['Valeria'],
              },
              {
                member: 'Oportunidades.cuentaOCliente',
                operator: 'contains',
                values: ['Valeria'],
              },
              {
                member: 'Oportunidades.companyId',
                operator: 'equals',
                values: ['invalid-company-id'],
              },
            ],
          },
        ],
      };

      securityService.sanitizeFilters(query, '11111111-1111-1111-1111-111111111111', 'admin');

      expect(query.filters).toHaveLength(1);
      expect(query.filters[0].or).toHaveLength(2);
      expect(query.filters[0].or[0].member).toBe('Usuarios.username');
      expect(query.filters[0].or[1].member).toBe('Oportunidades.cuentaOCliente');
    });

    it('should strip Usuarios.* from nested OR filters for executives', () => {
      const query: any = {
        filters: [
          {
            or: [
              {
                member: 'Usuarios.username',
                operator: 'contains',
                values: ['Valeria'],
              },
              {
                member: 'Oportunidades.cuentaOCliente',
                operator: 'contains',
                values: ['Valeria'],
              },
            ],
          },
        ],
      };

      securityService.sanitizeFilters(query, '99999999-9999-9999-9999-999999999999', 'executive');

      expect(query.filters).toHaveLength(1);
      expect(query.filters[0].or).toHaveLength(1);
      expect(query.filters[0].or[0].member).toBe('Oportunidades.cuentaOCliente');
    });
  });

  describe('WebchatEntityMatcherService - Multi-Entity & Mapping', () => {
    let matcherService: WebchatEntityMatcherService;
    const mockExecutor: any = {};
    const mockSecurity: any = {
      isExecutive: jest.fn().mockReturnValue(false),
      applySecurityFilters: jest.fn(),
    };
    const mockDataSource: any = {
      query: jest.fn(),
    };

    beforeEach(() => {
      matcherService = new WebchatEntityMatcherService(
        mockExecutor,
        mockSecurity,
        mockDataSource,
      );
    });

    it('should build multi-entity cube queries including Empresas and Oportunidades with moneda', () => {
      const queries = matcherService.buildMultiEntityCubeQueries('Bimbo', 'admin', 'user-1');

      const empresaQuery = queries.find(q => q.dimensions?.some(d => d.startsWith('Empresas.')));
      expect(empresaQuery).toBeDefined();
      expect(empresaQuery?.dimensions).toContain('Empresas.nombre');
      expect(empresaQuery?.filters?.[0].values).toEqual(['Bimbo']);

      const oppQuery = queries.find(q => q.dimensions?.some(d => d.startsWith('Oportunidades.')));
      expect(oppQuery).toBeDefined();
      expect(oppQuery?.dimensions).toContain('Oportunidades.moneda');
    });

    it('should map Cube.dev rows with Empresas to EntityMatchItem with entityType Empresa', () => {
      const cubeRows = [
        {
          'Empresas.id': 'comp-100',
          'Empresas.nombre': 'Grupo Bimbo S.A.B. de C.V.',
          'Empresas.correo': 'contacto@bimbo.com',
          'Empresas.telefono': '55-1234-5678',
          'Empresas.website': 'https://bimbo.com',
          'Empresas.estatus': true,
        },
      ];

      const items = matcherService.mapCubeRowsToMatchItems(cubeRows);
      expect(items).toHaveLength(1);
      expect(items[0].entityType).toBe('Empresa');
      expect(items[0].id).toBe('comp-100');
      expect(items[0].title).toBe('Grupo Bimbo S.A.B. de C.V.');
      expect(items[0].subtitle).toContain('contacto@bimbo.com');
    });

    it('should map Cube.dev rows with Oportunidades in USD with correct currency label', () => {
      const cubeRows = [
        {
          'Oportunidades.id': 'opp-200',
          'Oportunidades.nombreProyecto': 'Comentario prueba',
          'Oportunidades.montoTotal': 100,
          'Oportunidades.moneda': 'USD',
          'Oportunidades.cuentaOCliente': 'Acme Corp',
        },
      ];

      const items = matcherService.mapCubeRowsToMatchItems(cubeRows);
      expect(items).toHaveLength(1);
      expect(items[0].entityType).toBe('Oportunidad');
      expect(items[0].id).toBe('opp-200');
      expect(items[0].title).toBe('Comentario prueba');
      expect(items[0].subtitle).toContain('Monto: $100 USD');
      expect(items[0].subtitle).toContain('Cuenta: Acme Corp');
    });
  });
});
