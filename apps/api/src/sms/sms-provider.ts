import type { SmsPurpose } from '@predict/contracts';

export interface SmsSendResult {
  providerMessageId: string | null;
}

/** Sends one text. Implementations throw on failure; the caller records the outcome. */
export interface SmsProvider {
  readonly name: string;
  send(toE164: string, body: string, purpose: SmsPurpose): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** Nigerian gateways want the international number without the leading `+`. */
export const withoutPlus = (e164: string) => e164.replace(/^\+/, '');
