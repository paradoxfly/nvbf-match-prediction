// Formatting helpers safe to use from both server and client components.
import { formatWatClock, formatWatDateTime, watDate } from '@predict/domain';

export { formatNaira, formatWatDateTime, ordinal, watDate, watTime } from '@predict/domain';

const dayFormat = new Intl.DateTimeFormat('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** A calendar date stored as YYYY-MM-DD, e.g. "Sat 18 Oct", the same in every time zone. */
export const formatDay = (value: string) => dayFormat.format(new Date(`${value}T00:00:00Z`));

/** Kick-off style time in Lagos, e.g. "4:00pm". */
export const formatTime = (value: Date | string) => formatWatClock(new Date(value));

/**
 * A moment in Lagos time, as short as it can be: "1:56pm" today, "Tue 13 Oct, 1:56pm" on any
 * other day. Uses the device clock for "today", so call it from client components only.
 */
export function formatMoment(value: Date | string): string {
  const moment = new Date(value);
  return watDate(moment) === watDate(new Date())
    ? formatWatClock(moment)
    : formatWatDateTime(moment);
}

/** "12.5%" from basis points. */
export const formatBps = (bps: number) => `${(bps / 100).toLocaleString('en-NG')}%`;

/** True for a real calendar date written as YYYY-MM-DD (so it is safe to format). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** "1 player", "3 players". */
export const plural = (count: number, noun: string, many = `${noun}s`) =>
  `${count.toLocaleString('en-NG')} ${count === 1 ? noun : many}`;

/** Time left as "3d 4h", "2h 13m", "4m 05s" or "45s". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/**
 * Kobo as a plain naira amount for typing into a bank app or a form, with integer maths only:
 * 50000 → "500", 50050 → "500.50".
 */
export function koboToNairaText(kobo: number): string {
  const naira = Math.floor(kobo / 100);
  const rest = kobo % 100;
  return rest === 0 ? String(naira) : `${naira}.${String(rest).padStart(2, '0')}`;
}

/** A set score the way fans write it, e.g. "3–1". */
export const formatScore = (home: number, away: number) => `${home}–${away}`;

/** Every set of a match, e.g. "25–20, 18–25, 25–21". */
export const formatSets = (sets: readonly { home: number; away: number }[]) =>
  sets.map((set) => formatScore(set.home, set.away)).join(', ');

/** A Nigerian number spaced for reading: "+234 803 123 4567". */
export function formatPhone(e164: string): string {
  const match = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+234 ${match[1]} ${match[2]} ${match[3]}` : e164;
}
