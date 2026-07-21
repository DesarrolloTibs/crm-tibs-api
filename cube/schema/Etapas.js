cube(`Etapas`, {
  sql: `SELECT * FROM tblstagescatalog`,

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
