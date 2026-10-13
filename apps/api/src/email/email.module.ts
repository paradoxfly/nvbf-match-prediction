import { Global, Module } from '@nestjs/common';
import { product } from '@predict/brand';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { ConsoleEmailTransport } from './console.transport';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport';
import { EmailService } from './email.service';
import { ZapiackEmailTransport } from './zapiack.transport';

function createTransport(env: Env): EmailTransport {
  if (env.EMAIL_TRANSPORT === 'zapiack') {
    return new ZapiackEmailTransport({
      apiKey: env.ZAPIACK_API_KEY!,
      baseUrl: env.ZAPIACK_BASE_URL,
      templateId: env.ZAPIACK_TEMPLATE_ID!,
      from: env.EMAIL_FROM,
      productName: product.name,
    });
  }
  return new ConsoleEmailTransport(env.NODE_ENV === 'development');
}

@Global()
@Module({
  providers: [
    { provide: EMAIL_TRANSPORT, inject: [ENV], useFactory: createTransport },
    EmailService,
  ],
  exports: [EmailService, EMAIL_TRANSPORT],
})
export class EmailModule {}
