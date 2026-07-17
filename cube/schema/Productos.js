cube(`Productos`, {
  sql: `SELECT * FROM products`,

  measures: {
    count: {
      type: `count`,
      drillMembers: [id, nombre]
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
      sql: `"precioBase"`,
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
