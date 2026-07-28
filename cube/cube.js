const fs = require('fs');
const path = require('path');
const PostgresDriver = require('@cubejs-backend/postgres-driver');

/**
 * Lee y parsea dinámicamente el archivo .env para asegurar que Cube.dev
 * siempre utilice las credenciales más recientes sin importar si el .env cambió.
 */
function getLatestEnv() {
  const envVars = {};
  const envPaths = [
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../.env'),
    '/cube/conf/.env',
    '/cube/.env',
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const equalsIdx = trimmed.indexOf('=');
          if (equalsIdx > 0) {
            const key = trimmed.substring(0, equalsIdx).trim();
            let val = trimmed.substring(equalsIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            envVars[key] = val;
          }
        }
        if (Object.keys(envVars).length > 0) break;
      } catch (err) {
        // Ignorar error de lectura de archivo
      }
    }
  }
  return envVars;
}

module.exports = {
  dbType: () => 'postgres',

  contextToAppId: ({ securityContext }) => {
    const env = getLatestEnv();
    const user = env.DB_USERNAME || process.env.DB_USERNAME || 'default';
    const host = env.DB_HOST || process.env.DB_HOST || 'default';
    const tenant = (securityContext && typeof securityContext.tenantSchema === 'string')
      ? securityContext.tenantSchema
      : 'public';
    return `CUBE_APP_${user}_${host}_${tenant}`;
  },

  contextToOrchestratorId: ({ securityContext }) => {
    const env = getLatestEnv();
    const user = env.DB_USERNAME || process.env.DB_USERNAME || 'default';
    const host = env.DB_HOST || process.env.DB_HOST || 'default';
    const tenant = (securityContext && typeof securityContext.tenantSchema === 'string')
      ? securityContext.tenantSchema
      : 'public';
    return `CUBE_APP_${user}_${host}_${tenant}`;
  },

  driverFactory: ({ securityContext }) => {
    const env = getLatestEnv();
    const host = env.DB_HOST || process.env.DB_HOST;
    const port = env.DB_PORT || process.env.DB_PORT || 5432;
    const database = env.DB_DATABASE || process.env.DB_DATABASE || 'postgres';
    const user = env.DB_USERNAME || process.env.DB_USERNAME;
    const password = env.DB_PASSWORD || process.env.DB_PASSWORD;

    return new PostgresDriver({
      host,
      port: Number(port),
      database,
      user,
      password,
      ssl: { rejectUnauthorized: false }
    });
  }
};
