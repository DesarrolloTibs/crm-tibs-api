import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { NestAppLogger } from './common/logger/nest-logger';

async function bootstrap() {
  const appLogger = new NestAppLogger('Bootstrap');
  const logger = appLogger;

  // Guardia de seguridad: bloquear inicio si synchronize:true en producción
  if (process.env.NODE_ENV === 'production' && process.env.DB_SYNCHRONIZE === 'true') {
    logger.error('FATAL: DB_SYNCHRONIZE=true está prohibido en NODE_ENV=production. Abortando inicio.');
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: NestAppLogger.getLogLevels(),
  });
  app.useLogger(new NestAppLogger());

  // --- Seguridad: Helmet (headers HTTP seguros) ---
  // contentSecurityPolicy:false para no romper Swagger UI
  app.use((helmet as any).default({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // --- CORS: Habilitar ANTES de archivos estáticos para permitir descarga de logos/archivos ---
  const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:3000';
  const allowedOrigins = rawOrigins.split(',').map((o) => o.trim());
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // --- Archivos estáticos desde 'uploads' ---
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads',
  });

  // --- Archivos estáticos desde 'static' ---
  const staticDir = join(process.cwd(), 'static');
  if (!existsSync(staticDir)) {
    mkdirSync(staticDir, { recursive: true });
  }

  app.useStaticAssets(staticDir, {
    prefix: '/static',
  });

  // --- Middleware para servir desde Azure si no se encuentra localmente ---
  app.use('/uploads', async (req: any, res: any) => {
    const storageType = process.env.STORAGE_TYPE || 'local';
    if (storageType === 'azure') {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const containerName = process.env.AZURE_STORAGE_CONTAINER || 'uploads';
      if (connectionString) {
        try {
          const { BlobServiceClient } = require('@azure/storage-blob');
          const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
          const containerClient = blobServiceClient.getContainerClient(containerName);

          const blobName = join('uploads', req.path).replace(/\\/g, '/');
          const blockBlobClient = containerClient.getBlockBlobClient(blobName);

          const exists = await blockBlobClient.exists();
          if (exists) {
            const downloadResponse = await blockBlobClient.download(0);
            res.setHeader('Content-Type', downloadResponse.contentType || 'application/octet-stream');
            if (downloadResponse.contentLength) {
              res.setHeader('Content-Length', downloadResponse.contentLength);
            }
            if (downloadResponse.readableStreamBody) {
              downloadResponse.readableStreamBody.pipe(res);
              return;
            }
          }
        } catch (err) {
          logger.error(`Error serving file from Azure: ${(err as Error).message}`);
        }
      }
    }
    res.status(404).send('File not found');
  });

  // --- Prefijo global de API ---
  app.setGlobalPrefix('api');

  // --- Pipes, Filters e Interceptors globales ---
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // --- Pipes, Filters e Interceptors globales ---

  // --- Swagger / OpenAPI ---
  const config = new DocumentBuilder()
    .setTitle('CRM TIBS API')
    .setDescription(
      'API empresarial para el CRM TIBS — gestión de clientes, oportunidades, tickets, agente IA y multi-tenancy.\n\n' +
      '**Autenticación:** Bearer JWT en el header `Authorization: Bearer <token>`.\n\n' +
      '**Errores estándar:** Todas las respuestas de error siguen el esquema `ErrorResponseDto` ' +
      '`{ statusCode, message, timestamp, path }`.',
    )
    .setVersion('2.0')
    .addServer(process.env.API_URL || 'http://localhost:3000', 'Servidor actual')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        description: 'Ingresa el token JWT obtenido de POST /api/auth/login',
      },
      'bearer',
    )
    .setContact('Equipo TIBS', 'https://tibs.com.mx', 'soporte@tibs.com.mx')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // Esquema de seguridad global: todos los endpoints muestran el candado en Swagger
  document.security = [{ bearer: [] }];

  SwaggerModule.setup('swagger', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
  logger.log(`Aplicación iniciada en puerto ${process.env.PORT ?? 3000}`);
  logger.log(`Ambiente: ${process.env.NODE_ENV ?? 'development'}`);
}
bootstrap();
