// Payment references fans put in their bank transfer: 6 random symbols plus a check symbol.

/** Crockford base32: no I, L, O or U, so references are easy to read and type. */
export const PAYMENT_REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** 6 random symbols + 1 check symbol. */
export const PAYMENT_REFERENCE_LENGTH = 7;

const BODY_LENGTH = PAYMENT_REFERENCE_LENGTH - 1;
const BASE = PAYMENT_REFERENCE_ALPHABET.length;

/**
 * Weighted check: Σ (i + 1) × value_i mod 32. It catches every swap of two neighbouring
 * different symbols and most single-symbol typos (all of them in the 1st, 3rd and 5th
 * symbols and in the check symbol).
 */
function checkValue(body: readonly number[]): number {
  return body.reduce((sum, value, index) => sum + (index + 1) * value, 0) % BASE;
}

/** A new reference like '7K3QX9S'. Pass a random integer source (e.g. crypto) so this stays pure. */
export function generatePaymentReference(randomInt: (maxExclusive: number) => number): string {
  const body: number[] = [];
  for (let index = 0; index < BODY_LENGTH; index += 1) {
    const value = randomInt(BASE);
    if (!Number.isInteger(value) || value < 0 || value >= BASE) {
      throw new RangeError(`randomInt(${BASE}) returned ${value}; expected 0 to ${BASE - 1}.`);
    }
    body.push(value);
  }
  return [...body, checkValue(body)]
    .map((value) => PAYMENT_REFERENCE_ALPHABET.charAt(value))
    .join('');
}

/** Uppercases, removes spaces and dashes, and fixes look-alikes: O → 0, I and L → 1, U → V. */
export function normalizePaymentReference(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s‐‑‒–—-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

/** True for a well-formed reference with the right check symbol (after normalizing). */
export function isValidPaymentReference(input: string): boolean {
  const reference = normalizePaymentReference(input);
  if (reference.length !== PAYMENT_REFERENCE_LENGTH) return false;
  const values: number[] = [];
  for (const symbol of reference) {
    const value = PAYMENT_REFERENCE_ALPHABET.indexOf(symbol);
    if (value < 0) return false;
    values.push(value);
  }
  return values[BODY_LENGTH] === checkValue(values.slice(0, BODY_LENGTH));
}
