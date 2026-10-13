import { Logger } from '@nestjs/common';
import type { EmailPurpose } from '@predict/contracts';
import type { EmailTransport, OutgoingEmail } from './email-transport';

export interface SentEmail {
  to: string;
  email: OutgoingEmail;
  purpose: EmailPurpose;
}

/**
 * Development and tests: nothing leaves the machine. Emails are kept in memory (tests read
 * codes from here) and logged in development only, since a code in a log is a way in.
 */
export class ConsoleEmailTransport implements EmailTransport {
  readonly name = 'console';
  readonly sent: SentEmail[] = [];
  private readonly logger = new Logger('Email');

  constructor(private readonly log: boolean) {}

  async send(to: string, email: OutgoingEmail, purpose: EmailPurpose) {
    this.sent.push({ to, email, purpose });
    if (this.sent.length > 500) this.sent.shift();
    if (this.log) {
      const code = email.code ? ` · code ${email.code}` : '';
      this.logger.log(`[${purpose}] to ${to}: ${email.subject}${code}`);
    }
    return { providerMessageId: null };
  }
}
