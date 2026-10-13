import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Test } from '@nestjs/testing';
import { CLIENT_HEADER } from '@predict/contracts';
import { migrateDatabase, seedReferenceData, sql, type Database } from '@predict/db';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { securityHeaders } from '../../src/common/security-headers';
import { ENV } from '../../src/config/config.module';
import { DB } from '../../src/database/database.module';
import { REDIS } from '../../src/redis/redis.module';
import { ConsoleSmsProvider } from '../../src/sms/console.provider';
import { SMS_PROVIDER } from '../../src/sms/sms-provider';
import { testEnv } from './env';

export interface TestAppOptions {
  /** Extra environment overrides (e.g. ADMIN_MFA_REQUIRED). */
  env?: Record<string, string>;
  /** Run against this Postgres instead of PGlite (used by the real-Postgres concurrency suite). */
  databaseUrl?: string;
}

/**
 * The real Nest app against a real (in-process) Postgres: PGlite served over a local socket,
 * migrated with the same migrations as production. No Docker or shared database needed.
 * Texts are captured in memory and files go to a temporary local storage directory.
 */
export async function createTestApp(options: TestAppOptions = {}) {
  let databaseUrl = options.databaseUrl;
  let pglite: PGlite | null = null;
  let server: PGLiteSocketServer | null = null;
  if (!databaseUrl) {
    pglite = await PGlite.create({ extensions: { citext } });
    server = new PGLiteSocketServer({ db: pglite, port: 0, maxConnections: 4 });
    await server.start();
    databaseUrl = `postgres://postgres:postgres@${server.getServerConn()}/postgres`;
  }
  await migrateDatabase(databaseUrl);
  const storageDir = await mkdtemp(join(tmpdir(), 'predict-test-'));

  const sms = new ConsoleSmsProvider(false);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(
      testEnv({
        DATABASE_URL: databaseUrl,
        // One connection keeps transactions from interleaving on PGlite's single session.
        DB_POOL_MAX: options.databaseUrl ? '10' : '1',
        STORAGE_LOCAL_DIR: storageDir,
        STORAGE_LOCAL_BASE_URL: '/v1/storage',
        ...options.env,
      }),
    )
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms)
    .overrideProvider(REDIS)
    .useValue(null)
    .compile();

  const app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
  app.use(securityHeaders({ production: false }));
  app.setGlobalPrefix('v1');
  await app.init();

  const db = app.get<Database>(DB);
  const limits = app.get(RateLimitService);

  const client = () => withClientHeader(request.agent(app.getHttpServer()));

  /** The latest code texted to a phone (E.164). */
  const codeFor = (phone: string): string => {
    const message = sms.sent.filter((m) => m.to === phone && m.purpose === 'otp').at(-1);
    const match = message ? /\b(\d{6})\b/.exec(message.body) : null;
    if (!match) throw new Error(`No code texted to ${phone}`);
    return match[1]!;
  };

  return {
    app,
    db,
    sms,
    storageDir,
    /** A cookie-keeping client that sends the first-party header, like the web app. */
    client,
    raw: () => request(app.getHttpServer()),
    codeFor,
    /** Signs a new player up through the real OTP flow; returns a signed-in client. */
    async player(phone = '+2348031234567', displayName = 'Ada Obi') {
      const agent = client();
      await agent.post('/v1/auth/otp/request').send({ phone }).expect(200);
      const verify = await agent
        .post('/v1/auth/otp/verify')
        .send({ phone, code: codeFor(phone) })
        .expect(200);
      if (verify.body.status === 'needs_profile') {
        await agent
          .post('/v1/auth/signup/complete')
          .send({
            signupTicket: verify.body.signupTicket,
            displayName,
            acceptTerms: true,
            confirmAdult: true,
          })
          .expect(200);
      }
      return agent;
    },
    async reset() {
      sms.sent.length = 0;
      limits.reset();
      const tables = await db.execute<{ tablename: string }>(sql`
        select tablename from pg_tables where schemaname = 'public'
      `);
      const names = tables.rows.map((row) => `"${row.tablename}"`).join(', ');
      await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
      await seedReferenceData(db);
    },
    async close() {
      await app.close();
      await server?.stop();
      await pglite?.close();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

type Agent = ReturnType<typeof request.agent>;

function withClientHeader(agent: Agent): Agent {
  for (const method of ['post', 'put', 'patch', 'delete'] as const) {
    const original = agent[method].bind(agent);
    agent[method] = ((url: string) =>
      original(url).set(CLIENT_HEADER, 'test')) as Agent[typeof method];
  }
  return agent;
}
