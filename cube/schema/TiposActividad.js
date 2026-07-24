cube(`TiposActividad`, {
  sql: `SELECT * FROM "${COMPILE_CONTEXT.securityContext && COMPILE_CONTEXT.securityContext.tenantSchema ? COMPILE_CONTEXT.securityContext.tenantSchema : 'public'}".tbltypeactivities`,

  measures: {
    count: {
      type: `count`,
      drillMembers: [id, nombre]
    }
  },

  dimensions: {
    id: {
      sql: `id`,
      type: `number`,
      primaryKey: true
    },

    nombre: {
      sql: `strname`,
      type: `string`
    },

    status: {
      sql: `blnstatus`,
      type: `boolean`
    }
  },

  dataSource: `default`
});
