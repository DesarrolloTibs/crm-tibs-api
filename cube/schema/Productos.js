cube(`Productos`, {
  sql: `SELECT * FROM products`,

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
