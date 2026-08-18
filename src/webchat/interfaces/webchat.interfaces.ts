export interface CubeQueryFilter {
  member: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'gt' | 'gte' | 'lt' | 'lte' | 'set' | 'notSet' | 'inDateRange' | 'beforeDate' | 'afterDate';
  values?: any[];
}

export interface CubeTimeDimension {
  dimension: string;
  dateRange?: string | [string, string];
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'hour';
}

export interface CubeQuery {
  measures?: string[];
  dimensions?: string[];
  filters?: CubeQueryFilter[];
  order?: Record<string, 'asc' | 'desc'> | Array<[string, 'asc' | 'desc']>;
  limit?: number;
  timeDimensions?: CubeTimeDimension[];
}

export interface DashboardRedirect {
  tab?: string;
  executiveId?: string;
  dateStart?: string;
  dateEnd?: string;
  pipelineId?: string;
  helpdeskId?: string;
}

export interface CubeQueryPlan {
  thought?: string;
  intent?: 'VAGUE_SEARCH' | 'SPECIFIC_ENTITY' | 'ANALYTICAL' | 'CONVERSATIONAL';
  detectedEntity?: 'Clientes' | 'Usuarios' | 'Productos' | 'Oportunidades' | 'Tickets' | 'Actividades' | 'Gastos' | null;
  canonicalSearchTerm?: string;
  cubeQuery?: CubeQuery;
  cubeQueries?: CubeQuery[];
  responseTemplate?: string;
  dashboardRedirect?: DashboardRedirect | null;
}

export interface WebchatResponse {
  answer: string;
  data?: Record<string, any>[];
  dashboardRedirect?: DashboardRedirect | null;
}

export interface ConversationHistoryMessage {
  role: string;
  content: string;
}

export interface EntityMatchItem {
  entityType: 'Cliente' | 'Usuario' | 'Producto' | 'Oportunidad' | 'Ticket';
  id: string;
  title: string;
  subtitle?: string;
  details?: Record<string, any>;
  raw: Record<string, any>;
}

export interface MultiEntitySearchResult {
  searchTerm: string;
  items: EntityMatchItem[];
  groupedByEntity: Record<string, EntityMatchItem[]>;
  totalCount: number;
}
