cube(`Oportunidades`, {
  sql: `SELECT * FROM opportunities`,

  joins: {
    Clientes: {
      sql: `${CUBE}.cliente_id = ${Clientes}.id`,
      relationship: `belongsTo`
    }
  },

  measures: {
    count: {
      type: `count`,
      drillMembers: [id, nombreProyecto]
    },

    montoTotalSum: {
      type: `sum`,
      sql: `monto_total`
    }
  },

  dimensions: {
    id: {
      sql: `id`,
      type: `string`,
      primaryKey: true
    },

    nombreProyecto: {
      sql: `nombre_proyecto`,
      type: `string`
    },

    descripcion: {
      sql: `description`,
      type: `string`
    },

    clienteId: {
      sql: `cliente_id`,
      type: `string`
    },

    moneda: {
      sql: `moneda`,
      type: `string`
    },

    stageId: {
      sql: `stage_id`,
      type: `string`
    }
  },

  dataSource: `default`
});
