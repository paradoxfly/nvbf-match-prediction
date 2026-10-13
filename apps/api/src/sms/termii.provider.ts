import type { SmsPurpose } from '@predict/contracts';
import { withoutPlus, type SmsProvider } from './sms-provider';

/**
 * Termii (https://developers.termii.com/messaging-api). Uses the `dnd` channel: the
 * transactional route that reaches numbers on Do-Not-Disturb and isn't blocked overnight on
 * MTN. The sender ID must be approved and the DND route enabled on the Termii account.
 */
export class TermiiSmsProvider implements SmsProvider {
  readonly name = 'termii';

  constructor(private readonly config: { apiKey: string; baseUrl: string; senderId: string }) {}

  async send(to: string, body: string, _purpose: SmsPurpose) {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/api/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        to: withoutPlus(to),
        from: this.config.senderId,
        sms: body,
        type: 'plain',
        channel: 'dnd',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message_id?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(`Termii ${response.status}: ${payload.message ?? 'send failed'}`);
    }
    return { providerMessageId: payload.message_id ?? null };
  }
}
