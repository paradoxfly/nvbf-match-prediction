import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { LocalStorage } from './local-storage';
import { LocalStorageController } from './local-storage.controller';
import { OBJECT_STORAGE } from './storage';

/** Uploaded files on the API's disk (a Docker volume in production), served by the API. */
@Global()
@Module({
  controllers: [LocalStorageController],
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ENV],
      useFactory: (env: Env) =>
        new LocalStorage(env.STORAGE_LOCAL_DIR, env.STORAGE_LOCAL_BASE_URL, env.AUTH_SECRET),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
