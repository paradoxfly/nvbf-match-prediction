import type { EmailPurpose } from '@predict/contracts';
import type { EmailTransport, OutgoingEmail } from './email-transport';
import { messageVariables } from './zapiack-template';

/**
 * Zapiack (https://docs.zapiack.com/email/overview). Zapiack only sends approved templates, so
 * every email goes through one general message template (see zapiack-template.ts) with the
 * words passed as variables and the subject set per send.
 */
export class ZapiackEmailTransport implements EmailTransport {
  readonly name = 'zapiack';

  constructor(
    private readonly config: {
      apiKey: string;
      baseUrl: string;
      templateId: string;
      from: string;
      productName: string;
    },
  ) {}

  async send(to: string, email: OutgoingEmail, _purpose: EmailPurpose) {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/email/send`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [to],
        templateId: this.config.templateId,
        subject: email.subject,
        variables: messageVariables(email, this.config.productName),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string | string[];
    };
    if (!response.ok) {
      const message = [payload.message ?? 'send failed'].flat().join('; ');
      throw new Error(`Zapiack ${response.status}: ${message}`);
    }
    return { providerMessageId: payload.id ?? null };
  }
}
