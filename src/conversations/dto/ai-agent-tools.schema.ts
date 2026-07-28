import { z } from 'zod';

export const RegisterContactSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  correo: z.string().email('Correo electrónico no válido.').nullable().optional(),
  telefono: z.string().min(8, 'El teléfono debe tener al menos 8 dígitos.').nullable().optional(),
});

export const UpdateContactSchema = z.object({
  nombre: z.string().min(2).optional(),
  correo: z.string().email().nullable().optional(),
  telefono: z.string().min(8).nullable().optional(),
});

export const CreateOpportunitySchema = z.object({
  nombreProyecto: z.string().min(3, 'El nombre del proyecto debe tener al menos 3 caracteres.'),
  descripcion: z.string().optional().default('Creado por Agente IA'),
  montoTotal: z.number().nonnegative().nullable().optional().default(null), // Nullable para desarrollos a la medida
  moneda: z.enum(['MXN', 'USD']).optional().default('MXN'),
  productIds: z.array(z.string()).optional(),
  nombreProducto: z.string().optional(), // Nombre del producto del catálogo que le interesa
  cantidad: z.number().positive().optional().default(1), // Cantidad solicitada por el cliente
  lineaNegocio: z.string().optional(), // 'Datos', 'Desarrollo', 'RH', etc.
  tipoEntrega: z.string().optional(), // 'Proyecto', 'Licencia', 'Asignacion', 'Bolsa de Horas', etc.
  licenciamiento: z.string().optional(), // 'Microsoft', 'IBM', 'Qlik', 'Alteryx', 'KNIME', etc.
});

export const ModifyOpportunitySchema = z.object({
  id: z.string().uuid('ID de oportunidad no válido (debe ser UUID).'),
  nombreProyecto: z.string().min(3).optional(),
  descripcion: z.string().optional(),
  montoTotal: z.number().nonnegative().nullable().optional(),
  moneda: z.enum(['MXN', 'USD']).optional(),
  cantidad: z.number().positive().optional(),
  nombreProducto: z.string().optional(),
});

export const CheckAvailabilitySchema = z.object({
  proposedDate: z.string().datetime({ message: 'La fecha debe estar en formato ISO 8601 UTC.' }),
});

export const CreateActivitySchema = z.object({
  activityText: z.string().min(1, 'El detalle de la actividad es obligatorio.'),
  date: z.string().datetime({ message: 'La fecha de la actividad debe estar en formato ISO 8601 UTC.' }),
  typeActivityId: z.number().int().positive('ID de tipo de actividad no válido.'),
  opportunityId: z.string().uuid().nullable().optional(),
  reminderTitle: z.string().optional(),
  reminderDate: z.string().datetime().nullable().optional(),
});

export const CreateTicketSchema = z.object({
  title: z.string().min(3, 'El título del ticket debe tener al menos 3 caracteres.'),
  description: z.string().min(5, 'Describe con más detalle el reporte.'),
  priority: z.number().int().min(1).max(3).optional().default(1), // 1 = Bajo, 2 = Medio, 3 = Alto
  category: z.string().optional().default('Soporte Técnico'),
});

export const ConsultProductCatalogSchema = z.object({
  query: z.string().min(2, 'Ingresa una consulta para el catálogo de productos.'),
  productKey: z.string().nullable().optional().describe('Filtro por identificador del producto.'),
});

export const SendQuotationPdfSchema = z.object({
  opportunityId: z.string().uuid('ID de oportunidad no válido (debe ser UUID).').optional(),
});

export const RequestHumanHandoffSchema = z.object({
  reason: z.string().optional().default('Derivación a ejecutivo especializado solicitada'),
});


