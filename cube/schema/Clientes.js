cube(`Clientes`, {
  sql: `SELECT * FROM "${COMPILE_CONTEXT.securityContext && COMPILE_CONTEXT.securityContext.tenantSchema ? COMPILE_CONTEXT.securityContext.tenantSchema : 'public'}".clients`,

  measures: {






    count: {
      type: `count`,
      drillMembers: [id, nombre, correo]
    }
  },

  dimensions: {
    id: {
      sql: `id`,
      type: `string`,
      primaryKey: true
    },

    nombre: {
      sql: `nombre`,
      type: `string`
    },

    apellido: {
      sql: `apellido`,
      type: `string`
    },

    correo: {
      sql: `correo`,
      type: `string`
    },

    telefono: {
      sql: `telefono`,
      type: `string`
    },

    category: {
      sql: `category`,
      type: `string`
    },

    estatus: {
      sql: `estatus`,
      type: `boolean`
    }
  },

  dataSource: `default`
});
