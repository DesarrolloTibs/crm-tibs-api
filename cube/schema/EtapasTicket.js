cube(`EtapasTicket`, {
  sql: `SELECT * FROM "${COMPILE_CONTEXT.securityContext && COMPILE_CONTEXT.securityContext.tenantSchema ? COMPILE_CONTEXT.securityContext.tenantSchema : 'public'}".ticket_stages`,

  joins: {},







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
      sql: `strname`,
      type: `string`
    }
  },

  dataSource: `default`
});
