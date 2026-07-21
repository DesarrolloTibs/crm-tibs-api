cube(`Gastos`, {
  sql: `SELECT * FROM expenses`,

  joins: {
    Clientes: {
      sql: `${CUBE}.client_id = ${Clientes}.id`,
      relationship: `belongsTo`
    },
    Oportunidades: {
      sql: `${CUBE}.opportunity_id = ${Oportunidades}.id`,
      relationship: `belongsTo`
    },
    Usuarios: {
      sql: `${CUBE}.usuario_id = ${Usuarios}.id`,
      relationship: `belongsTo`
    }
  },

  measures: {
    count: {
      type: `count`,
      drillMembers: [id, concepto]
    },

    montoSum: {
      type: `sum`,
      sql: `monto`
    }
  },

  dimensions: {
    id: {
      sql: `id`,
      type: `string`,
      primaryKey: true
    },

    concepto: {
      sql: `concepto`,
      type: `string`
    },

    monto: {
      sql: `monto`,
      type: `number`
    },

    fecha: {
      sql: `fecha`,
      type: `time`
    },

    usuarioId: {
      sql: `usuario_id`,
      type: `string`
    },

    clientId: {
      sql: `client_id`,
      type: `string`
    },

    opportunityId: {
      sql: `opportunity_id`,
      type: `string`
    },

    receiptUrl: {
      sql: `"receiptUrl"`,
      type: `string`
    },

    createdAt: {
      sql: `"createdAt"`,
      type: `time`
    }
  },

  dataSource: `default`
});
