import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { securityHeaders } from './common/security-headers';
import { ENV } from './config/config.module';
import type { Env } from './config/env';
import { mountApiDocs } from './openapi';

async function bootstrap() {
  // oRPC parses request bodies itself, so Nest's body parser must stay off.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const env = app.get<Env>(ENV);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(securityHeaders({ production: env.NODE_ENV === 'production' }));
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    await mountApiDocs(app.getHttpAdapter().getInstance(), env.APP_VERSION);
  }

  await app.listen(env.PORT);
  app.get(Logger).log(`API listening on http://localhost:${env.PORT}/v1`, 'Bootstrap');
}

void bootstrap();
