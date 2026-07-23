cube(`Productos`, {
  sql: `SELECT * FROM "${COMPILE_CONTEXT.securityContext && COMPILE_CONTEXT.securityContext.tenantSchema ? COMPILE_CONTEXT.securityContext.tenantSchema : 'public'}".products`,

  measures: {






    count: {
      type: `count`,
      drillMembers: [id, nombre]
    },
    precioBaseMax: {
      type: `max`,
      sql: `COALESCE("precioBase", 0)`
    },
    precioBaseMin: {
      type: `min`,
      sql: `COALESCE("precioBase", 0)`
    }
  },

  dimensions: {
    id: {
      sql: `id`,
      type: `string`,
      primaryKey: true
    },

    nombre: {
      sql: `LOWER(nombre)`,
      type: `string`
    },

    descripcion: {
      sql: `descripcion`,
      type: `string`
    },

    precioBase: {
      sql: `COALESCE("precioBase", 0)`,
      type: `number`
    },

    requiereAnalisis: {
      sql: `requiere_analisis`,
      type: `boolean`
    },

    status: {
      sql: `status`,
      type: `boolean`
    }
  },

  dataSource: `default`
});
