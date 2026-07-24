module.exports = {
  dbType: () => 'postgres',
  contextToAppId: ({ securityContext }) => {
    const tenant = (securityContext && typeof securityContext.tenantSchema === 'string')
      ? securityContext.tenantSchema
      : 'public';
    return `CUBE_APP_${tenant}`;
  },
  contextToOrchestratorId: ({ securityContext }) => {
    const tenant = (securityContext && typeof securityContext.tenantSchema === 'string')
      ? securityContext.tenantSchema
      : 'public';
    return `CUBE_APP_${tenant}`;
  }
};

