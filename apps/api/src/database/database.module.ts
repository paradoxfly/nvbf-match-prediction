import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type Database, type DatabaseHandle } from '@predict/db';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const DB_HANDLE = Symbol('DB_HANDLE');
export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      inject: [ENV],
      useFactory: (env: Env): DatabaseHandle =>
        createDatabase(env.DATABASE_URL, { max: env.DB_POOL_MAX }),
    },
    {
      provide: DB,
      inject: [DB_HANDLE],
      useFactory: (handle: DatabaseHandle): Database => handle.db,
    },
  ],
  exports: [DB, DB_HANDLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown() {
    await this.handle.pool.end();
  }
}
