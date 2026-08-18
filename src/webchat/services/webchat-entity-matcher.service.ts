import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { WebchatCubeExecutorService } from './webchat-cube-executor.service';
import { WebchatSecurityService } from './webchat-security.service';
import { CubeQuery, EntityMatchItem, MultiEntitySearchResult } from '../interfaces/webchat.interfaces';

@Injectable()
export class WebchatEntityMatcherService {
  private readonly logger = new Logger('WebchatEntityMatcherService');

  constructor(
    private readonly cubeExecutor: WebchatCubeExecutorService,
    private readonly securityService: WebchatSecurityService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Determina de forma heurística si una consulta es "vaga" (ej: solo un nombre, marca o término corto).
   */
  isVagueQuery(question: string): boolean {
    if (!question) return false;
    const clean = question.trim().toLowerCase();

    // Palabras que denotan intenciones analíticas, temporales o comandos específicos
    const analyticalKeywords = [
      'cuantos', 'cuántos', 'cuantas', 'cuántas', 'total', 'suma', 'promedio',
      'top', 'mes', 'año', 'ano', 'semana', 'dashboard', 'grafica', 'gráfica',
      'ganadas', 'perdidas', 'abiertos', 'cerrados', 'cerradas', 'reporte',
    ];

    if (analyticalKeywords.some(kw => clean.includes(kw))) {
      return false;
    }

    const words = clean.split(/\s+/).filter(w => w.length > 0);
    // Consultas de 1 a 3 palabras sin operadores analíticos
    return words.length >= 1 && words.length <= 4;
  }

  /**
   * Genera consultas para la Capa Semántica dirigidas a múltiples entidades candidatas
   * (Clientes, Usuarios, Productos, Oportunidades, Tickets).
   */
  buildMultiEntityCubeQueries(searchTerm: string, userRole: string, userId: string): CubeQuery[] {
    const cleanSearch = searchTerm.trim();
    if (!cleanSearch) return [];

    const isExec = this.securityService.isExecutive(userRole);
    const queries: CubeQuery[] = [];

    // 1. Clientes (Buscar por nombre, apellido o correo)
    queries.push({
      dimensions: [
        'Clientes.nombre',
        'Clientes.apellido',
        'Clientes.correo',
        'Clientes.telefono',
        'Clientes.category',
        'Clientes.estatus',
      ],
      filters: [
        {
          member: 'Clientes.nombre',
          operator: 'contains',
          values: [cleanSearch],
        },
      ],
      limit: 5,
    });

    // 2. Productos (Catálogo)
    queries.push({
      dimensions: [
        'Productos.id',
        'Productos.nombre',
        'Productos.descripcion',
        'Productos.precioBase',
        'Productos.unidadMedida',
        'Productos.status',
      ],
      filters: [
        {
          member: 'Productos.nombre',
          operator: 'contains',
          values: [cleanSearch],
        },
      ],
      limit: 5,
    });

    // 3. Usuarios (Solo para SuperAdmin y Admin)
    if (!isExec) {
      queries.push({
        dimensions: [
          'Usuarios.id',
          'Usuarios.username',
          'Usuarios.correo',
          'Usuarios.role',
          'Usuarios.status',
        ],
        filters: [
          {
            member: 'Usuarios.username',
            operator: 'contains',
            values: [cleanSearch],
          },
        ],
        limit: 5,
      });
    }

    // 4. Oportunidades
    const oppQuery: CubeQuery = {
      dimensions: [
        'Oportunidades.id',
        'Oportunidades.nombreProyecto',
        'Oportunidades.montoTotal',
        'Oportunidades.moneda',
        'Oportunidades.clienteId',
      ],
      filters: [
        {
          member: 'Oportunidades.nombreProyecto',
          operator: 'contains',
          values: [cleanSearch],
        },
      ],
      limit: 5,
    };
    this.securityService.applySecurityFilters(oppQuery, userId, userRole);
    queries.push(oppQuery);

    // 5. Tickets
    const ticketQuery: CubeQuery = {
      dimensions: [
        'Tickets.id',
        'Tickets.ticketNumber',
        'Tickets.titulo',
        'Tickets.tipoIncidencia',
        'Tickets.contactName',
      ],
      filters: [
        {
          member: 'Tickets.titulo',
          operator: 'contains',
          values: [cleanSearch],
        },
      ],
      limit: 5,
    };
    this.securityService.applySecurityFilters(ticketQuery, userId, userRole);
    queries.push(ticketQuery);

    return queries;
  }

  /**
   * Realiza una búsqueda transversal en la base de datos (fallback / fuzzy / multi-token)
   * para manejar errores ortográficos o términos divididos (ej. "Juan Pérez").
   */
  async fallbackFuzzyEntitySearch(
    searchTerm: string,
    userRole: string,
    userId: string,
  ): Promise<EntityMatchItem[]> {
    const rawTerms = searchTerm.trim().split(/\s+/).filter(t => t.length >= 2);
    if (rawTerms.length === 0) return [];

    const tenantSchema = TenantContextService.getTenantSchema() || 'public';
    const isExec = this.securityService.isExecutive(userRole);
    const matches: EntityMatchItem[] = [];

    try {
      // 1. Buscar en Clientes (nombre, apellido, correo, empresa)
      const clientConditions = rawTerms.map((_, i) => `(nombre ILIKE $${i + 1} OR apellido ILIKE $${i + 1} OR correo ILIKE $${i + 1} OR empresa ILIKE $${i + 1})`).join(' AND ');
      const clientParams = rawTerms.map(t => `%${t}%`);
      const clientQuery = `
        SELECT id, nombre, apellido, correo, telefono, empresa, category, estatus
        FROM "${tenantSchema}".clients
        WHERE ${clientConditions}
        LIMIT 5;
      `;
      const clients = await this.dataSource.query(clientQuery, clientParams).catch(() => []);
      for (const c of clients) {
        matches.push({
          entityType: 'Cliente',
          id: c.id,
          title: `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Cliente sin nombre',
          subtitle: c.empresa ? `Empresa: ${c.empresa} | Correo: ${c.correo || 'N/A'}` : `Correo: ${c.correo || 'N/A'}`,
          details: {
            correo: c.correo,
            telefono: c.telefono,
            categoria: c.category,
            estatus: c.estatus ? 'Activo' : 'Inactivo',
          },
          raw: {
            'Clientes.id': c.id,
            'Clientes.nombre': c.nombre,
            'Clientes.apellido': c.apellido,
            'Clientes.correo': c.correo,
            'Clientes.telefono': c.telefono,
            'Clientes.category': c.category,
            'Clientes.estatus': c.estatus,
          },
        });
      }

      // 2. Buscar en Productos (nombre, descripcion)
      const prodConditions = rawTerms.map((_, i) => `(nombre ILIKE $${i + 1} OR descripcion ILIKE $${i + 1})`).join(' AND ');
      const prodParams = rawTerms.map(t => `%${t}%`);
      const prodQuery = `
        SELECT id, nombre, descripcion, "precioBase", "unidadMedida", status
        FROM "${tenantSchema}".products
        WHERE ${prodConditions}
        LIMIT 5;
      `;
      const products = await this.dataSource.query(prodQuery, prodParams).catch(() => []);
      for (const p of products) {
        matches.push({
          entityType: 'Producto',
          id: p.id,
          title: p.nombre,
          subtitle: `Precio: $${Number(p.precioBase || 0).toLocaleString('es-MX')} MXN por ${p.unidadMedida || 'Pieza'}`,
          details: {
            precioBase: p.precioBase,
            unidadMedida: p.unidadMedida,
            descripcion: p.descripcion,
            status: p.status,
          },
          raw: {
            'Productos.id': p.id,
            'Productos.nombre': p.nombre,
            'Productos.descripcion': p.descripcion,
            'Productos.precioBase': p.precioBase,
            'Productos.unidadMedida': p.unidadMedida,
            'Productos.status': p.status,
          },
        });
      }

      // 3. Buscar en Usuarios (Solo SuperAdmin y Admin)
      if (!isExec) {
        const userConditions = rawTerms.map((_, i) => `(username ILIKE $${i + 1} OR email ILIKE $${i + 1})`).join(' AND ');
        const userParams = rawTerms.map(t => `%${t}%`);
        const userQuery = `
          SELECT id, username, email, role, "isActive"
          FROM "${tenantSchema}".users
          WHERE ${userConditions}
          LIMIT 5;
        `;
        const users = await this.dataSource.query(userQuery, userParams).catch(() => []);
        for (const u of users) {
          matches.push({
            entityType: 'Usuario',
            id: u.id,
            title: u.username,
            subtitle: `Rol: ${u.role} | Email: ${u.email}`,
            details: {
              email: u.email,
              role: u.role,
              activo: u.isActive,
            },
            raw: {
              'Usuarios.id': u.id,
              'Usuarios.username': u.username,
              'Usuarios.correo': u.email,
              'Usuarios.role': u.role,
              'Usuarios.status': u.isActive,
            },
          });
        }
      }

      // 4. Buscar en Oportunidades
      const oppConditions = rawTerms.map((_, i) => `"nombreProyecto" ILIKE $${i + 1}`).join(' AND ');
      const oppParams: any[] = rawTerms.map(t => `%${t}%`);
      let oppQuery = `
        SELECT id, "nombreProyecto", "montoTotal", moneda, "clienteId", "ejecutivoId"
        FROM "${tenantSchema}".opportunities
        WHERE ${oppConditions}
      `;
      if (isExec && userId) {
        oppParams.push(userId);
        oppQuery += ` AND "ejecutivoId" = $${oppParams.length}`;
      }
      oppQuery += ` LIMIT 5;`;

      const opportunities = await this.dataSource.query(oppQuery, oppParams).catch(() => []);
      for (const o of opportunities) {
        matches.push({
          entityType: 'Oportunidad',
          id: o.id,
          title: o.nombreProyecto,
          subtitle: `Monto: $${Number(o.montoTotal || 0).toLocaleString('es-MX')} ${o.moneda || 'MXN'}`,
          details: {
            montoTotal: o.montoTotal,
            moneda: o.moneda,
          },
          raw: {
            'Oportunidades.id': o.id,
            'Oportunidades.nombreProyecto': o.nombreProyecto,
            'Oportunidades.montoTotal': o.montoTotal,
            'Oportunidades.moneda': o.moneda,
          },
        });
      }

      // 5. Buscar en Tickets
      const ticketConditions = rawTerms.map((_, i) => `(titulo ILIKE $${i + 1} OR "contactName" ILIKE $${i + 1})`).join(' AND ');
      const ticketParams: any[] = rawTerms.map(t => `%${t}%`);
      let ticketQuery = `
        SELECT id, "ticketNumber", titulo, "tipoIncidencia", "contactName", "responsableId"
        FROM "${tenantSchema}".tickets
        WHERE ${ticketConditions}
      `;
      if (isExec && userId) {
        ticketParams.push(userId);
        ticketQuery += ` AND "responsableId" = $${ticketParams.length}`;
      }
      ticketQuery += ` LIMIT 5;`;

      const tickets = await this.dataSource.query(ticketQuery, ticketParams).catch(() => []);
      for (const t of tickets) {
        matches.push({
          entityType: 'Ticket',
          id: t.id,
          title: `Folio #${t.ticketNumber}: ${t.titulo}`,
          subtitle: `Incidencia: ${t.tipoIncidencia || 'General'} | Contacto: ${t.contactName || 'N/A'}`,
          details: {
            ticketNumber: t.ticketNumber,
            tipoIncidencia: t.tipoIncidencia,
            contactName: t.contactName,
          },
          raw: {
            'Tickets.id': t.id,
            'Tickets.ticketNumber': t.ticketNumber,
            'Tickets.titulo': t.titulo,
            'Tickets.tipoIncidencia': t.tipoIncidencia,
            'Tickets.contactName': t.contactName,
          },
        });
      }

    } catch (err: any) {
      this.logger.warn(`[EntityMatcher - Fuzzy Fallback] Error en búsqueda transversal: ${err.message}`);
    }

    return matches;
  }

  /**
   * Transforma los resultados crudos de Cube.dev a items tipados `EntityMatchItem`.
   */
  mapCubeRowsToMatchItems(cubeRows: any[]): EntityMatchItem[] {
    const items: EntityMatchItem[] = [];

    for (const row of cubeRows) {
      if (row['Clientes.id']) {
        items.push({
          entityType: 'Cliente',
          id: row['Clientes.id'],
          title: `${row['Clientes.nombre'] || ''} ${row['Clientes.apellido'] || ''}`.trim() || 'Cliente',
          subtitle: `Correo: ${row['Clientes.correo'] || 'N/A'} | Teléfono: ${row['Clientes.telefono'] || 'N/A'}`,
          raw: row,
        });
      } else if (row['Productos.id']) {
        items.push({
          entityType: 'Producto',
          id: row['Productos.id'],
          title: row['Productos.nombre'] || 'Producto',
          subtitle: `Precio: $${Number(row['Productos.precioBase'] || 0).toLocaleString('es-MX')} por ${row['Productos.unidadMedida'] || 'Pieza'}`,
          raw: row,
        });
      } else if (row['Usuarios.id']) {
        items.push({
          entityType: 'Usuario',
          id: row['Usuarios.id'],
          title: row['Usuarios.username'] || 'Usuario',
          subtitle: `Rol: ${row['Usuarios.role'] || 'N/A'} | Correo: ${row['Usuarios.correo'] || 'N/A'}`,
          raw: row,
        });
      } else if (row['Oportunidades.id']) {
        items.push({
          entityType: 'Oportunidad',
          id: row['Oportunidades.id'],
          title: row['Oportunidades.nombreProyecto'] || 'Oportunidad',
          subtitle: `Monto: $${Number(row['Oportunidades.montoTotal'] || 0).toLocaleString('es-MX')} ${row['Oportunidades.moneda'] || 'MXN'}`,
          raw: row,
        });
      } else if (row['Tickets.id']) {
        items.push({
          entityType: 'Ticket',
          id: row['Tickets.id'],
          title: `Folio #${row['Tickets.ticketNumber'] || row['Tickets.id']}: ${row['Tickets.titulo'] || 'Ticket'}`,
          subtitle: `Incidencia: ${row['Tickets.tipoIncidencia'] || 'General'}`,
          raw: row,
        });
      }
    }

    return items;
  }
}
