cube(`Actividades`, {
  sql: `SELECT * FROM activities`,

  joins: {
    Clientes: {
      sql: `${CUBE}.clientId = ${Clientes}.id`,
      relationship: `belongsTo`
    },
    Oportunidades: {
      sql: `${CUBE}.opportunityId = ${Oportunidades}.id`,
      relationship: `belongsTo`
    }
  },

  measures: {
    count: {
      type: `count`,
      drillMembers: [id, actividad]
    }
  },

  dimensions: {
    id: {
      sql: `id`,
      type: `string`,
      primaryKey: true
    },

    actividad: {
      sql: `activity`,
      type: `string`
    },

    fecha: {
      sql: `date`,
      type: `time`
    },

    typeActivityId: {
      sql: `typeActivityId`,
      type: `number`
    },

    opportunityId: {
      sql: `opportunityId`,
      type: `string`
    },

    clientId: {
      sql: `clientId`,
      type: `string`
    }
  },

  dataSource: `default`
});
