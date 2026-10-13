import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { LocalStorage } from './local-storage';
import { LocalStorageController } from './local-storage.controller';
import { R2Storage } from './r2-storage';
import { OBJECT_STORAGE, type ObjectStorage } from './storage';

function createStorage(env: Env): ObjectStorage {
  if (env.STORAGE_DRIVER === 'r2') {
    return new R2Storage({
      accountId: env.R2_ACCOUNT_ID!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      publicBucket: env.R2_BUCKET_NAME!,
      publicUrl: env.R2_PUBLIC_URL!,
    });
  }
  return new LocalStorage(env.STORAGE_LOCAL_DIR, env.STORAGE_LOCAL_BASE_URL, env.AUTH_SECRET);
}

@Global()
@Module({})
export class StorageModule {
  /**
   * The local driver also needs HTTP routes to receive uploads, so the controller is only
   * mounted when that driver is chosen. The choice is read from the process environment.
   */
  static register(): DynamicModule {
    const driver = process.env.STORAGE_DRIVER === 'r2' ? 'r2' : 'local';
    return {
      module: StorageModule,
      controllers: driver === 'local' ? [LocalStorageController] : [],
      providers: [
        { provide: OBJECT_STORAGE, inject: [ENV], useFactory: (env: Env) => createStorage(env) },
      ],
      exports: [OBJECT_STORAGE],
    };
  }
}
