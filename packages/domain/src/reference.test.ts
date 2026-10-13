import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  generatePaymentReference,
  isValidPaymentReference,
  normalizePaymentReference,
  PAYMENT_REFERENCE_ALPHABET,
  PAYMENT_REFERENCE_LENGTH,
} from './reference';

/** A randomInt that returns the given values in turn. */
function sequence(values: number[]): (maxExclusive: number) => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

/** Deterministic pseudo-random source (mulberry32) so the sample is stable. */
function seeded(seed: number): (maxExclusive: number) => number {
  let state = seed;
  return (maxExclusive) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}

const SAMPLE = Array.from({ length: 50 }, (_, i) => generatePaymentReference(seeded(i + 1)));

function replaceAt(text: string, index: number, symbol: string): string {
  return text.slice(0, index) + symbol + text.slice(index + 1);
}

function swapAt(text: string, index: number): string {
  const chars = [...text];
  const left = chars[index] ?? '';
  chars[index] = chars[index + 1] ?? '';
  chars[index + 1] = left;
  return chars.join('');
}

describe('generatePaymentReference', () => {
  it.each([
    { values: [0], expected: '0000000' },
    { values: [1, 2, 3, 4, 5, 6], expected: '123456V' }, // 1·1 + 2·2 + … + 6·6 = 91; 91 mod 32 = 27 → V
    { values: [31], expected: 'ZZZZZZB' }, // 31 × (1 + … + 6) = 651; 651 mod 32 = 11 → B
  ])('$values → $expected', ({ values, expected }) => {
    expect(generatePaymentReference(sequence(values))).toBe(expected);
  });

  it('only produces valid 7-symbol references', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 31 }), { minLength: 6, maxLength: 6 }),
        (values) => {
          const reference = generatePaymentReference(sequence(values));
          expect(reference).toHaveLength(PAYMENT_REFERENCE_LENGTH);
          expect([...reference].every((c) => PAYMENT_REFERENCE_ALPHABET.includes(c))).toBe(true);
          expect(isValidPaymentReference(reference)).toBe(true);
        },
      ),
    );
  });

  it.each([32, -1, 1.5, Number.NaN])('throws when randomInt returns %s', (value) => {
    expect(() => generatePaymentReference(() => value)).toThrow();
  });

  it('asks for numbers below 32', () => {
    const asked: number[] = [];
    generatePaymentReference((max) => {
      asked.push(max);
      return 0;
    });
    expect(asked).toEqual([32, 32, 32, 32, 32, 32]);
  });
});

describe('normalizePaymentReference', () => {
  it.each([
    [' 7k3q-x9a ', '7K3QX9A'],
    ['7K3 QX9 A', '7K3QX9A'],
    ['o0il', '0011'],
    ['OIL', '011'],
    ['u', 'V'],
    ['ab–cd', 'ABCD'],
  ])('%o → %o', (input, expected) => {
    expect(normalizePaymentReference(input)).toBe(expected);
  });
});

describe('isValidPaymentReference', () => {
  const valid = generatePaymentReference(sequence([1, 2, 3, 4, 5, 6])); // '123456V'

  it.each([
    { input: valid, ok: true },
    { input: '123-456v', ok: true },
    { input: ' 123 456 v ', ok: true },
    { input: '1234S6V', ok: false }, // wrong symbol
    { input: '123456W', ok: false }, // wrong check symbol
    { input: '123456', ok: false }, // too short
    { input: '123456V0', ok: false }, // too long
    { input: '12345#V', ok: false }, // not in the alphabet
    { input: '', ok: false },
  ])('$input → $ok', ({ input, ok }) => {
    expect(isValidPaymentReference(input)).toBe(ok);
  });

  it('accepts look-alike letters typed by hand', () => {
    const reference = generatePaymentReference(sequence([0, 1, 0, 1, 27, 0]));
    const typed = reference.replace(/0/g, 'o').replace(/1/g, 'l').replace(/V/g, 'u');
    expect(isValidPaymentReference(typed)).toBe(true);
  });

  it('catches every swap of two neighbouring different symbols', () => {
    for (const reference of SAMPLE) {
      for (let index = 0; index < PAYMENT_REFERENCE_LENGTH - 1; index += 1) {
        const swapped = swapAt(reference, index);
        if (swapped === reference) continue;
        expect(isValidPaymentReference(swapped), `${reference} → ${swapped}`).toBe(false);
      }
    }
  });

  it('catches every single-symbol typo in the 1st, 3rd and 5th symbols and the check symbol', () => {
    for (const reference of SAMPLE) {
      for (const index of [0, 2, 4, 6]) {
        for (const symbol of PAYMENT_REFERENCE_ALPHABET) {
          const typo = replaceAt(reference, index, symbol);
          if (typo === reference) continue;
          expect(isValidPaymentReference(typo), `${reference} → ${typo}`).toBe(false);
        }
      }
    }
  });

  it('misses only 5 of the 217 possible single-symbol typos (mod 32 limit)', () => {
    for (const reference of SAMPLE) {
      let missed = 0;
      for (let index = 0; index < PAYMENT_REFERENCE_LENGTH; index += 1) {
        for (const symbol of PAYMENT_REFERENCE_ALPHABET) {
          const typo = replaceAt(reference, index, symbol);
          if (typo !== reference && isValidPaymentReference(typo)) missed += 1;
        }
      }
      expect(missed).toBe(5);
    }
  });
});
