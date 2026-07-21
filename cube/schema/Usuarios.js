cube(`Usuarios`, {
  sql: `SELECT * FROM users`,

  measures: {
    count: {
      type: `count`,
      drillMembers: [id, username]
    }
  },

  dimensions: {
    id: {
      sql: `id`,
      type: `string`,
      primaryKey: true
    },

    username: {
      sql: `username`,
      type: `string`
    },

    correo: {
      sql: `correo`,
      type: `string`
    },

    role: {
      sql: `role`,
      type: `string`
    },

    status: {
      sql: `status`,
      type: `boolean`
    }
  },

  dataSource: `default`
});
