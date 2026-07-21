cube(`EtapasTicket`, {
  sql: `SELECT * FROM ticket_stages`,

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
  }
});
