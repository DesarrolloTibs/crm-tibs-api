import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync, statSync, readdirSync } from 'fs';
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

  // --- Archivos estáticos desde 'uploads' (rutas con y sin /backend) ---
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads',
  });

  app.useStaticAssets(uploadsDir, {
    prefix: '/backend/uploads',
  });

  // --- Archivos estáticos desde 'static' ---
  const staticDir = join(process.cwd(), 'static');
  if (!existsSync(staticDir)) {
    mkdirSync(staticDir, { recursive: true });
  }

  app.useStaticAssets(staticDir, {
    prefix: '/static',
  });

  app.useStaticAssets(staticDir, {
    prefix: '/backend/static',
  });

  // --- Middleware de fallback para /uploads y /backend/uploads (Servir local, Azure o fallback PDF) ---
  app.use(['/uploads', '/backend/uploads'], async (req: any, res: any) => {
    const rawPath = req.path || '';
    const cleanPath = rawPath.replace(/^\/backend\/uploads/, '').replace(/^\/uploads/, '');
    const localFile = join(uploadsDir, cleanPath.replace(/^\//, ''));

    // 1. Si el archivo solicitado existe en el disco local
    if (existsSync(localFile) && statSync(localFile).isFile()) {
      const ext = localFile.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') res.setHeader('Content-Type', 'application/pdf');
      else if (ext === 'png') res.setHeader('Content-Type', 'image/png');
      else if (ext === 'jpg' || ext === 'jpeg') res.setHeader('Content-Type', 'image/jpeg');
      else if (ext === 'webp') res.setHeader('Content-Type', 'image/webp');
      
      return res.sendFile(localFile);
    }

    // 2. Si es una cotización PDF (/quotations/:opportunityId/:filename) y ese archivo exacto no existe
    const quotationMatch = cleanPath.match(/^\/quotations\/([a-f0-9\-]{36})\/([^\/]+)$/i);
    if (quotationMatch) {
      const opportunityId = quotationMatch[1];
      const oppDir = join(uploadsDir, 'quotations', opportunityId);
      
      if (existsSync(oppDir)) {
        const pdfFiles = readdirSync(oppDir).filter((f) => f.endsWith('.pdf'));
        if (pdfFiles.length > 0) {
          const newestPdf = pdfFiles.sort().pop();
          res.setHeader('Content-Type', 'application/pdf');
          return res.sendFile(join(oppDir, newestPdf!));
        }
      }
    }

    // 3. Fallback a Azure si STORAGE_TYPE === 'azure'
    const storageType = process.env.STORAGE_TYPE || 'local';
    if (storageType === 'azure') {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const containerName = process.env.AZURE_STORAGE_CONTAINER || 'uploads';
      if (connectionString) {
        try {
          const { BlobServiceClient } = require('@azure/storage-blob');
          const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
          const containerClient = blobServiceClient.getContainerClient(containerName);

          const blobName = join('uploads', cleanPath).replace(/\\/g, '/');
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

    // 4. Si el archivo no existe, responder 404 plano para evitar que Nginx lo capture como HTML del SPA
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Archivo no encontrado');
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
