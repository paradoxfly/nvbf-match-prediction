// Nigerian mobile numbers: the account identifier.

import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';

/** Digits, spaces, '+', brackets, dots and dashes only (no letters or extensions). */
const PHONE_CHARACTERS = /^[+\d\s().-]+$/;
const MAX_INPUT_LENGTH = 32;

/**
 * A Nigerian mobile number in E.164 form ('+2348031234567'), or `null` when the input isn't one.
 * Accepts '08031234567', '8031234567', '2348031234567' and '+234 803 123 4567'.
 */
export function normalizeNigerianPhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (text.length === 0 || text.length > MAX_INPUT_LENGTH || !PHONE_CHARACTERS.test(text)) {
    return null;
  }
  const phone = parsePhoneNumberFromString(text, 'NG');
  if (phone === undefined || phone.country !== 'NG' || !phone.isValid()) return null;
  return phone.number;
}

/** Hides the middle of a number for display: '+2348031234567' → '+234 803 ••• ••67'. */
export function maskPhone(e164: string): string {
  const nigerian = /^\+234(\d{3})\d{5}(\d{2})$/.exec(e164);
  if (nigerian !== null) return `+234 ${nigerian[1]} ••• ••${nigerian[2]}`;
  const compact = e164.replace(/\s/g, '');
  if (compact.length <= 6) return '•'.repeat(compact.length);
  return `${compact.slice(0, 4)} ${'•'.repeat(compact.length - 6)}${compact.slice(-2)}`;
}
