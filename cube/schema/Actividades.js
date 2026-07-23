cube(`Actividades`, {
  sql: `SELECT * FROM "${COMPILE_CONTEXT.securityContext && COMPILE_CONTEXT.securityContext.tenantSchema ? COMPILE_CONTEXT.securityContext.tenantSchema : 'public'}".activities`,

  joins: {






    Clientes: {
      sql: `${CUBE}."clientId" = ${Clientes}.id`,
      relationship: `belongsTo`
    },
    Oportunidades: {
      sql: `${CUBE}."opportunityId" = ${Oportunidades}.id`,
      relationship: `belongsTo`
    },
    Usuarios: {
      sql: `${CUBE}."userId" = ${Usuarios}.id`,
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
      sql: `"typeActivityId"`,
      type: `number`
    },

    opportunityId: {
      sql: `"opportunityId"`,
      type: `string`
    },

    clientId: {
      sql: `"clientId"`,
      type: `string`
    },

    userId: {
      sql: `"userId"`,
      type: `string`
    }
  },

  dataSource: `default`
});
