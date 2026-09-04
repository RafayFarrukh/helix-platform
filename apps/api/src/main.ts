import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './shared/config/configuration';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Security headers, strict CORS allow-list, and no framework fingerprinting.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001').split(','),
    credentials: true,
    exposedHeaders: ['x-correlation-id', 'x-ratelimit-remaining'],
  });
  app.enableShutdownHooks();

  // URI versioning is chosen over headers so that a v2 of one product can ship
  // while the other 99 stay on v1 — versions are per product, not per platform.
  app.enableVersioning({ type: VersioningType.URI, prefix: '' });

  const swagger = new DocumentBuilder()
    .setTitle('Helix Platform API')
    .setDescription('One gateway, many products. Every route is tenant-scoped and permission-gated.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(config.PORT, '0.0.0.0');
  new Logger('bootstrap').log(`Helix API listening on :${config.PORT} (docs at /docs)`);
}

void bootstrap();
