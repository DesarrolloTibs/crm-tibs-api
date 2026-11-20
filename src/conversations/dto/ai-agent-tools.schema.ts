import { z } from 'zod';

const emptyToNull = (val: unknown) => (typeof val === 'string' && val.trim() === '' ? null : val);
const emptyToUndefined = (val: unknown) => (typeof val === 'string' && val.trim() === '' ? undefined : val);

const boundedAmountSchema = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return val;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^0-9.-]/g, '');
      if (!cleaned) return NaN;
      return Number(cleaned);
    }
    return NaN;
  },
  z
    .number()
    .finite('El monto debe ser numérico y finito.')
    .min(0, 'El monto no puede ser negativo.')
    .max(99999999.99, 'El monto excede el límite permitido (99,999,999.99).'),
);

const positiveQuantitySchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null || val === '') return 1;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^0-9.-]/g, '');
      if (!cleaned) return NaN;
      return Number(cleaned);
    }
    return NaN;
  },
  z
    .number()
    .finite('La cantidad debe ser numérica.')
    .positive('La cantidad debe ser mayor a 0.')
    .max(999999, 'La cantidad excede el límite permitido (999,999).'),
);

export const RegisterContactSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(255, 'El nombre no debe exceder 255 caracteres.'),
  correo: z.preprocess(
    emptyToNull,
    z.string().trim().toLowerCase().email('Correo electrónico no válido.').max(255).nullable().optional(),
  ),
  telefono: z.preprocess(
    emptyToNull,
    z.string().trim().min(7, 'El teléfono debe tener al menos 7 dígitos.').max(50, 'El teléfono no debe exceder 50 caracteres.').nullable().optional(),
  ),
  empresa: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(255, 'La empresa no debe exceder 255 caracteres.').optional(),
  ),
});

export const UpdateContactSchema = z.object({
  nombre: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(255).optional(),
  ),
  correo: z.preprocess(
    emptyToNull,
    z.string().trim().toLowerCase().email('Correo electrónico no válido.').max(255).nullable().optional(),
  ),
  telefono: z.preprocess(
    emptyToNull,
    z.string().trim().min(7, 'El teléfono debe tener al menos 7 dígitos.').max(50, 'El teléfono no debe exceder 50 caracteres.').nullable().optional(),
  ),
  empresa: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(255, 'La empresa no debe exceder 255 caracteres.').optional(),
  ),
});

export const OpportunityItemSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre del producto es obligatorio.').max(255).describe('Nombre del producto o servicio'),
  cantidad: positiveQuantitySchema.describe('Cantidad solicitada').default(1),
  // Se mantiene string flexible para resolver nombres o calibres si el LLM no envía UUID exacto
  productId: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()).describe('ID UUID o identificador del producto si está disponible'),
});

export const CreateOpportunitySchema = z.object({
  items: z.array(OpportunityItemSchema).max(50, 'Máximo 50 productos por cotización.').optional().describe('Lista desglosada de productos y cantidades a cotizar'),
  nombreProyecto: z.string().trim().min(3, 'El nombre del proyecto debe tener al menos 3 caracteres.').max(255, 'El nombre del proyecto no debe exceder 255 caracteres.'),
  descripcion: z.string().trim().max(1000, 'La descripción no debe exceder 1000 caracteres.').optional().default('Creado por Agente IA'),
  montoTotal: boundedAmountSchema.nullable().optional().default(null), // Nullable para desarrollos a la medida
  moneda: z.enum(['MXN', 'USD']).optional().default('MXN'),
  productIds: z.array(z.string().trim().max(255)).max(50).optional(),
  nombreProducto: z.union([z.string().trim().max(255), z.array(z.string().trim().max(255)).max(50)]).optional(),
  cantidad: z.union([
    positiveQuantitySchema,
    z.array(positiveQuantitySchema).max(50),
  ]).optional().default(1),
  lineaNegocio: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()),
  tipoEntrega: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()),
  licenciamiento: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()),
  correo: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().email('Correo electrónico no válido.').max(255).optional()),
  email: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().email('Correo electrónico no válido.').max(255).optional()),
  telefono: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  empresa: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()),
});

export const ModifyProductItemInputSchema = z.object({
  productId: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()),
  nombreProducto: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()),
  cantidad: positiveQuantitySchema.optional(),
});

export const ModifyOpportunitySchema = z.object({
  items: z.array(OpportunityItemSchema).max(50).optional().describe('Lista desglosada de productos y cantidades a cotizar o modificar'),
  id: z.string().uuid('ID de oportunidad no válido (debe ser UUID).'),
  nombreProyecto: z.preprocess(emptyToUndefined, z.string().trim().min(3).max(255).optional()),
  descripcion: z.preprocess(emptyToUndefined, z.string().trim().max(1000).optional()),
  montoTotal: boundedAmountSchema.nullable().optional(),
  moneda: z.enum(['MXN', 'USD']).optional(),
  cantidad: z.union([
    positiveQuantitySchema,
    z.array(positiveQuantitySchema).max(50),
  ]).optional(),
  nombreProducto: z.union([z.string().trim().max(255), z.array(z.string().trim().max(255)).max(50)]).optional(),
  productItems: z.array(ModifyProductItemInputSchema).max(50).optional(),
});

export const CheckAvailabilitySchema = z.object({
  proposedDate: z.string().trim().datetime({ offset: true, message: 'La fecha debe estar en formato ISO 8601.' }),
});

export const CreateActivitySchema = z.object({
  activityText: z.string().trim().min(1, 'El detalle de la actividad es obligatorio.').max(5000, 'La actividad no debe exceder 5000 caracteres.'),
  date: z.string().trim().datetime({ offset: true, message: 'La fecha de la actividad debe estar en formato ISO 8601.' }),
  typeActivityId: z.coerce.number().int().positive('ID de tipo de actividad no válido.').max(100000),
  opportunityId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  reminderTitle: z.preprocess(emptyToUndefined, z.string().trim().max(100, 'El título del recordatorio no debe exceder 100 caracteres.').optional()),
  reminderDate: z.preprocess(emptyToNull, z.string().trim().datetime({ offset: true }).nullable().optional()),
  correo: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().email('Correo electrónico no válido.').max(255).optional()),
  email: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().email('Correo electrónico no válido.').max(255).optional()),
});

export const CreateTicketSchema = z.object({
  title: z.string().trim().min(3, 'El título del ticket debe tener al menos 3 caracteres.').max(255, 'El título no debe exceder 255 caracteres.'),
  description: z.string().trim().min(5, 'Describe con más detalle el reporte.').max(10000, 'La descripción no debe exceder 10,000 caracteres.'),
  priority: z.coerce.number().int().min(1).max(3).optional().default(1), // 1 = Bajo, 2 = Medio, 3 = Alto
  category: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(255).optional()).default('Soporte Técnico'),
});

export const ConsultProductCatalogSchema = z.object({
  query: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()).default('todos los productos'),
  productKey: z.preprocess(emptyToNull, z.string().trim().max(150).nullable().optional()).describe('Filtro por identificador del producto.'),
  products: z.array(z.string().trim().max(150)).max(20).optional(),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  productName: z.preprocess(emptyToUndefined, z.string().trim().max(255).optional()),
  items: z.array(z.union([z.string().trim().max(255), OpportunityItemSchema])).max(20).optional(),
});

export const SendQuotationPdfSchema = z.object({
  opportunityId: z.preprocess(emptyToUndefined, z.string().uuid('ID de oportunidad no válido (debe ser UUID).').optional()),
});

export const RequestHumanHandoffSchema = z.object({
  reason: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()).default('Derivación a ejecutivo especializado solicitada'),
});

export const AI_AGENT_TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  registerContact: RegisterContactSchema,
  updateContact: UpdateContactSchema,
  createOpportunity: CreateOpportunitySchema,
  modifyOpportunity: ModifyOpportunitySchema,
  checkAvailability: CheckAvailabilitySchema,
  createActivity: CreateActivitySchema,
  createTicket: CreateTicketSchema,
  consult_product_catalog: ConsultProductCatalogSchema,
  sendQuotationPdf: SendQuotationPdfSchema,
  requestHumanHandoff: RequestHumanHandoffSchema,
};
