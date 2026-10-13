import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ENV } from '../src/config/config.module';
import { testEnv } from './support/env';
import { DB_HANDLE } from '../src/database/database.module';
import { REDIS } from '../src/redis/redis.module';

// Exercises the real Nest + oRPC wiring end to end, with the database and Redis stubbed.
describe('GET /v1/health', () => {
  let app: INestApplication;
  const redis = { status: 'ready', ping: vi.fn(), quit: vi.fn().mockResolvedValue('OK') };
  const pool = { query: vi.fn(), end: vi.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue(testEnv({ REDIS_URL: 'redis://localhost:6379' }))
      .overrideProvider(DB_HANDLE)
      .useValue({ db: {}, pool })
      .overrideProvider(REDIS)
      .useValue(redis)
      .compile();

    app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ok when dependencies respond', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    redis.ping.mockResolvedValueOnce('PONG');

    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      version: '1.2.3',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('reports degraded when the database is down', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection refused'));
    redis.ping.mockResolvedValueOnce('PONG');

    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'degraded',
      checks: { database: 'down', redis: 'up' },
    });
  });

  it('answers unknown routes in the shared error shape', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nope').expect(404);

    expect(res.body).toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
