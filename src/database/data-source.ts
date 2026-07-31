/**
 * DataSource para el CLI de TypeORM.
 *
 * Este archivo es usado exclusivamente por los comandos de migración:
 *   npm run migration:generate -- src/database/migrations/NombreMigracion
 *   npm run migration:run
 *   npm run migration:revert
 *   npm run migration:show
 *
 * Lee las variables de entorno desde el archivo .env en la raíz del proyecto.
 * El schema objetivo es siempre 'public' — las migraciones de esquemas de tenant
 * se gestionan en TenantProvisionerService cuando se crea un nuevo tenant.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Cargar variables de entorno desde .env
dotenv.config({ path: join(process.cwd(), '.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'crm_tibs',
  // Entidades: usa el patrón de archivos compilados y TypeScript
  entities: [join(__dirname, '/../**/*.entity{.ts,.js}')],
  // Migraciones: directorio donde se guardan los archivos generados
  migrations: [join(__dirname, '/migrations/*{.ts,.js}')],
  // synchronize SIEMPRE false en este DataSource — se usan las migraciones
  synchronize: false,
  // logging útil al generar/verificar migraciones
  logging: ['query', 'error', 'migration'],
});
