import { formatWatDateTime, nairaToKobo, watDate, watTime, watToUtc } from '@predict/domain';

export { formatNaira, ordinal } from '@predict/domain';

const dateTimeFormat = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

/** A moment shown in Lagos time (WAT), e.g. "18 Oct 2026, 16:00". */
export const formatDateTime = (value: string | Date | null | undefined) =>
  value ? `${dateTimeFormat.format(new Date(value))}` : '—';

/** 'Sat 18 Oct, 16:00 WAT'. */
export const formatWat = (value: string | Date | null | undefined) =>
  value ? formatWatDateTime(new Date(value)) : '—';

/** The WAT wall-clock time of a moment, e.g. "16:00". */
export const formatTime = (value: string | Date | null | undefined) =>
  value ? watTime(new Date(value)) : '—';

const dayFormat = new Intl.DateTimeFormat('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A calendar date stored as YYYY-MM-DD, shown the same in every time zone. */
export const formatDay = (value: string | null | undefined) =>
  value ? dayFormat.format(new Date(`${value}T00:00:00Z`)) : '—';

const shortDayFormat = new Intl.DateTimeFormat('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Sat 18 Oct" for a YYYY-MM-DD date. */
export const formatShortDay = (value: string | null | undefined) =>
  value ? shortDayFormat.format(new Date(`${value}T00:00:00Z`)) : '—';

/** "1 player", "3 players". */
export const plural = (count: number, noun: string, many = `${noun}s`) =>
  `${count.toLocaleString('en-NG')} ${count === 1 ? noun : many}`;

/** "12.5%" from basis points. */
export const formatBps = (bps: number) => `${(bps / 100).toLocaleString('en-NG')}%`;

// ---------------------------------------------------------------------------------------------
// Form helpers: amounts, percentages and Lagos date/times typed by staff. Never floats.

/** Kobo as an editable naira amount: 50000 → "500", 123450 → "1234.50". */
export function koboToInput(kobo: number): string {
  const naira = Math.floor(kobo / 100);
  const rest = kobo % 100;
  return rest === 0 ? String(naira) : `${naira}.${String(rest).padStart(2, '0')}`;
}

/** A typed naira amount as kobo, or an error message. */
export function parseNaira(
  text: string,
  { min = 0, required = true }: { min?: number; required?: boolean } = {},
): { kobo: number | null; error?: string } {
  if (text.trim() === '')
    return required ? { kobo: null, error: 'Enter an amount.' } : { kobo: null };
  try {
    const kobo = nairaToKobo(text);
    if (kobo < min) return { kobo: null, error: `Use at least ${formatNairaShort(min)}.` };
    return { kobo };
  } catch (error) {
    return { kobo: null, error: error instanceof Error ? error.message : 'Enter a naira amount.' };
  }
}

const formatNairaShort = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

/** Basis points as an editable percentage: 1250 → "12.5". */
export function bpsToPercentInput(bps: number): string {
  const whole = Math.floor(bps / 100);
  const rest = bps % 100;
  if (rest === 0) return String(whole);
  return `${whole}.${String(rest).padStart(2, '0').replace(/0$/, '')}`;
}

/** A typed percentage (up to 2 decimals) as basis points: "12.5" → 1250. Null when invalid. */
export function percentInputToBps(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/%$/, '').trim());
  if (!match) return null;
  const bps = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bps <= 10_000 ? bps : null;
}

/** A typed whole number within bounds, or null. */
export function parseWhole(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

/** An ISO moment split into Lagos date + time inputs (empty strings when missing). */
export function toWatInputs(value: string | Date | null | undefined): {
  date: string;
  time: string;
} {
  if (!value) return { date: '', time: '' };
  const moment = new Date(value);
  return { date: watDate(moment), time: watTime(moment) };
}

/** Lagos date + time inputs as an ISO moment, or null when incomplete/invalid. */
export function fromWatInputs(date: string, time: string): string | null {
  if (!date || !time) return null;
  try {
    return watToUtc(date, time.slice(0, 5)).toISOString();
  } catch {
    return null;
  }
}

/** Initials for a logo placeholder: "Kano Pillars" → "KP". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((word) => word[0]) : [name.slice(0, 2)];
  return letters.join('').toUpperCase();
}
