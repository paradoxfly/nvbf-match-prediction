import { describe, expect, it } from 'vitest';
import { maskPhone, normalizeNigerianPhone } from './phone';

describe('normalizeNigerianPhone', () => {
  it.each([
    '08031234567',
    '8031234567',
    '2348031234567',
    '+234 803 123 4567',
    '+2348031234567',
    '0803-123-4567',
    '0803 123 4567',
    '  08031234567  ',
    '+234 (0) 803 123 4567',
  ])('%o → +2348031234567', (input) => {
    expect(normalizeNigerianPhone(input)).toBe('+2348031234567');
  });

  // Mobile prefixes across MTN, Airtel, Glo and 9mobile; all validated by libphonenumber-js.
  it.each([
    '0803',
    '0806',
    '0813',
    '0816',
    '0703',
    '0706',
    '0810',
    '0814',
    '0903',
    '0905',
    '0802',
    '0808',
    '0812',
    '0701',
    '0708',
    '0809',
    '0817',
    '0818',
    '0909',
    '0908',
  ])('accepts the %s prefix', (prefix) => {
    expect(normalizeNigerianPhone(`${prefix}1234567`)).toBe(`+234${prefix.slice(1)}1234567`);
  });

  it.each([
    ['too short', '0803123456'],
    ['too long', '080312345678'],
    ['letters', '0803abc4567'],
    ['a trailing letter', '08031234567x'],
    ['a UK mobile', '+44 7400 123456'],
    ['a US number', '+1 202 555 0123'],
    ['a Lagos landline', '01 270 1234'],
    ['empty', ''],
    ['spaces only', '   '],
    ['very long input', `0803${'1'.repeat(40)}`],
  ])('rejects %s', (_, input) => {
    expect(normalizeNigerianPhone(input)).toBeNull();
  });
});

describe('maskPhone', () => {
  it.each([
    ['+2348031234567', '+234 803 ••• ••67'],
    ['+2349091234599', '+234 909 ••• ••99'],
    ['+447400123456', '+447 •••••••56'],
    ['+2341', '•••••'],
  ])('%s → %s', (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });
});
