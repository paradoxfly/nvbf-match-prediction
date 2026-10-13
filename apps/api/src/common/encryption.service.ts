import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { decrypt, encrypt, hmac } from './crypto';

/** Encrypts data we must read back (account numbers, TOTP secrets) with DATA_ENCRYPTION_KEY. */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly keyId: string;

  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');
    this.keyId = env.DATA_ENCRYPTION_KEY_ID;
  }

  get currentKeyId() {
    return this.keyId;
  }

  encrypt(plaintext: string): string {
    return encrypt(this.key, this.keyId, plaintext);
  }

  decrypt(payload: string): string {
    return decrypt({ [this.keyId]: this.key }, payload);
  }

  /** Stable keyed hash for spotting duplicates without storing the value in the clear. */
  fingerprint(value: string): string {
    return hmac(this.key.toString('base64'), value);
  }
}
