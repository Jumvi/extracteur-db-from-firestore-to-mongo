import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;

  const config = new DocumentBuilder()
    .setTitle('GeoSuivi ↔ Spaces API')
    .setDescription('Endpoints pour audit et réparation des médias (flag_rapport=1)')
    .setVersion('0.1.0')
    .addTag('audit')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`NestJS API listening on http://localhost:${port} — Swagger UI: /api`);
}

bootstrap();
