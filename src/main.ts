import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
 app.setGlobalPrefix('api'); 
  // Enable CORS for frontend communication
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
