import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { assertProductionEnvironment } from './operational.js';

async function bootstrap(): Promise<void> {
  assertProductionEnvironment();
  const app = await NestFactory.create(AppModule);
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isSafeInteger(trustProxyHops) && trustProxyHops > 0) {
    const adapterInstance: unknown = app.getHttpAdapter().getInstance();
    if (
      !adapterInstance ||
      typeof (adapterInstance as { set?: unknown }).set !== 'function'
    ) {
      throw new Error(
        'HTTP adapter does not support trust proxy configuration',
      );
    }
    (adapterInstance as { set: (name: string, value: number) => void }).set(
      'trust proxy',
      trustProxyHops,
    );
  }
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
