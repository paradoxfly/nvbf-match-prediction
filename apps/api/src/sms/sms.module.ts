import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { BulkSmsNigeriaProvider } from './bulksmsnigeria.provider';
import { ConsoleSmsProvider } from './console.provider';
import { SMS_PROVIDER, type SmsProvider } from './sms-provider';
import { SmsService } from './sms.service';
import { TermiiSmsProvider } from './termii.provider';

function createProvider(env: Env): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'termii':
      return new TermiiSmsProvider({
        apiKey: env.TERMII_API_KEY!,
        baseUrl: env.TERMII_BASE_URL,
        senderId: env.SMS_SENDER_ID,
      });
    case 'bulksmsnigeria':
      return new BulkSmsNigeriaProvider({
        apiToken: env.BULKSMSNIGERIA_API_TOKEN!,
        baseUrl: env.BULKSMSNIGERIA_BASE_URL,
        senderId: env.SMS_SENDER_ID,
      });
    default:
      return new ConsoleSmsProvider(env.NODE_ENV === 'development');
  }
}

@Global()
@Module({
  providers: [{ provide: SMS_PROVIDER, inject: [ENV], useFactory: createProvider }, SmsService],
  exports: [SmsService, SMS_PROVIDER],
})
export class SmsModule {}
