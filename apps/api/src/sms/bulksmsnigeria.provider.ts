import type { SmsPurpose } from '@predict/contracts';
import { withoutPlus, type SmsProvider } from './sms-provider';

/**
 * BulkSMS Nigeria API v2 (https://www.bulksmsnigeria.com/api). OTPs use the `otp` gateway;
 * other transactional texts use the corporate route. Both reach DND numbers.
 */
export class BulkSmsNigeriaProvider implements SmsProvider {
  readonly name = 'bulksmsnigeria';

  constructor(private readonly config: { apiToken: string; baseUrl: string; senderId: string }) {}

  async send(to: string, body: string, purpose: SmsPurpose) {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/sms`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${this.config.apiToken}`,
      },
      body: JSON.stringify({
        from: this.config.senderId,
        to: withoutPlus(to),
        body,
        gateway: purpose === 'otp' ? 'otp' : 'direct-corporate',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { message_id?: string; messageId?: string };
      message?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      const reason = payload.error?.message ?? payload.message ?? 'send failed';
      throw new Error(`BulkSMS Nigeria ${response.status}: ${reason}`);
    }
    return { providerMessageId: payload.data?.message_id ?? payload.data?.messageId ?? null };
  }
}
