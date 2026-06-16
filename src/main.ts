import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore
import { Client } from 'pg';

// Cargar variables de entorno manualmente antes de conectar a la BD
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value.trim();
    }
  });
}

async function runMigrations() {
  console.log('Ejecutando migración previa de base de datos...');
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    await client.connect();
    const migrationSqlPath = path.join(process.cwd(), 'migration.sql');
    if (fs.existsSync(migrationSqlPath)) {
      const sql = fs.readFileSync(migrationSqlPath, 'utf8');
      await client.query(sql);
      console.log('Migración de base de datos ejecutada con éxito.');
    } else {
      console.warn('Advertencia: No se encontró el archivo migration.sql.');
    }
  } catch (error) {
    console.error('Error durante la migración de base de datos:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function bootstrap() {
  await runMigrations();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Servir archivos estáticos desde la carpeta 'uploads'
  // IMPORTANTE: Esto debe ir ANTES de setGlobalPrefix
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Establece un prefijo global para la API.
  app.setGlobalPrefix('api');

  // Configuración explícita de CORS para permitir la comunicación con el frontend
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('CRM API')
    .setDescription('The API for the TIBS CRM application')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // Aplicar el esquema de seguridad globalmente para que todos los endpoints
  // muestren el candado y puedan usar la autorización ingresada en Swagger
  document.security = [{ bearer: [] }];

  SwaggerModule.setup('swagger', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
