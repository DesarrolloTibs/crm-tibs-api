import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Servir archivos estáticos desde la carpeta 'uploads'
  // IMPORTANTE: Esto debe ir ANTES de setGlobalPrefix
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Servir archivos estáticos desde la carpeta 'static'
  app.useStaticAssets(join(process.cwd(), 'static'), {
    prefix: '/static/',
  });

  // Middleware para servir desde Azure si no se encuentra localmente
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
          console.error('Error serving file from Azure:', err);
        }
      }
    }
    res.status(404).send('File not found');
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
