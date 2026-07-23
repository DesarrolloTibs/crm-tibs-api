cube(`Etapas`, {
  sql: `SELECT * FROM "${COMPILE_CONTEXT.securityContext && COMPILE_CONTEXT.securityContext.tenantSchema ? COMPILE_CONTEXT.securityContext.tenantSchema : 'public'}".tblstagescatalog`,

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
    },

    pipelineId: {
      sql: `pipeline_id`,
      type: `string`
    }
  }
});
