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

  // Establece un prefijo global para la API.
  app.setGlobalPrefix('api');

  // Configuración explícita de CORS para permitir la comunicación con el frontend
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('CRM API')
    .setDescription('The API for the TIBS CRM application')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
