cube(`Usuarios`, {
  sql: `SELECT * FROM "${COMPILE_CONTEXT.securityContext && COMPILE_CONTEXT.securityContext.tenantSchema ? COMPILE_CONTEXT.securityContext.tenantSchema : 'public'}".users WHERE LOWER(role::text) ${COMPILE_CONTEXT.securityContext && COMPILE_CONTEXT.securityContext.tenantSchema && COMPILE_CONTEXT.securityContext.tenantSchema !== 'public' ? "!= 'superadmin'" : "= 'superadmin'"}`,

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
