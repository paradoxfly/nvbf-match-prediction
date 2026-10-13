import type { EmailPurpose } from '@predict/contracts';
import type { EmailContent } from '@predict/db';

/** One email as a transport sends it: the content plus, for sign-in emails, the code. */
export interface OutgoingEmail extends EmailContent {
  code?: string;
}

export interface EmailSendResult {
  providerMessageId: string | null;
}

/** Sends one email. Implementations throw on failure; the caller records the outcome. */
export interface EmailTransport {
  readonly name: string;
  send(to: string, email: OutgoingEmail, purpose: EmailPurpose): Promise<EmailSendResult>;
}

export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');
