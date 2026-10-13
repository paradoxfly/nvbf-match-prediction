import { Logger } from '@nestjs/common';
import type { SmsPurpose } from '@predict/contracts';
import type { SmsProvider } from './sms-provider';

export interface SentSms {
  to: string;
  body: string;
  purpose: SmsPurpose;
}

/**
 * Development and tests: nothing leaves the machine. Messages are kept in memory (tests read
 * codes from here) and logged in development only, since a code in a log is a way in.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  readonly sent: SentSms[] = [];
  private readonly logger = new Logger('Sms');

  constructor(private readonly log: boolean) {}

  async send(to: string, body: string, purpose: SmsPurpose) {
    this.sent.push({ to, body, purpose });
    if (this.sent.length > 500) this.sent.shift();
    if (this.log) this.logger.log(`[${purpose}] to ${to}: ${body}`);
    return { providerMessageId: null };
  }
}
