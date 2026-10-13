// West Africa Time helpers. WAT is UTC+1 all year (no daylight saving); store UTC, show WAT.

export const TIME_ZONE = 'Africa/Lagos';
export const TIME_ZONE_LABEL = 'WAT';

const WAT_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function timeOf(date: Date): number {
  const ms = date.getTime();
  if (Number.isNaN(ms)) throw new RangeError('Invalid date.');
  return ms;
}

/** Midnight UTC of a YYYY-MM-DD calendar date, in ms. Throws on bad formats or impossible dates. */
function parseCalendarDate(date: string): number {
  const match = DATE_PATTERN.exec(date);
  if (match === null) throw new RangeError(`Expected a date like 2025-10-18, got "${date}".`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`${date} is not a real date.`);
  }
  return ms;
}

/** YYYY-MM-DD of the UTC calendar day containing `ms`. */
function utcCalendarDate(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) throw new RangeError('Date is out of range.');
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  return `${year}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** The instant of a WAT wall-clock time: watToUtc('2025-10-18', '16:00') → 15:00 UTC. */
export function watToUtc(date: string, time: string): Date {
  const midnight = parseCalendarDate(date);
  const match = TIME_PATTERN.exec(time);
  if (match === null) throw new RangeError(`Expected a 24-hour time like 16:00, got "${time}".`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return new Date(midnight + minutes * 60_000 - WAT_OFFSET_MS);
}

/** The WAT calendar date (YYYY-MM-DD) of an instant. */
export function watDate(d: Date): string {
  return utcCalendarDate(timeOf(d) + WAT_OFFSET_MS);
}

/** The WAT wall-clock time (HH:MM, 24-hour) of an instant. */
export function watTime(d: Date): string {
  const shifted = new Date(timeOf(d) + WAT_OFFSET_MS);
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

/** '4:00pm', '9:05am', '12:30am': the Lagos clock time of an instant, as people write it. */
export function formatWatClock(d: Date): string {
  const shifted = new Date(timeOf(d) + WAT_OFFSET_MS);
  const hours = shifted.getUTCHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${pad2(shifted.getUTCMinutes())}${hours < 12 ? 'am' : 'pm'}`;
}

let watDayFormatter: Intl.DateTimeFormat | undefined;

/** 'Sat 18 Oct, 4:00pm' in Lagos time. The order is fixed so it reads the same everywhere. */
export function formatWatDateTime(d: Date): string {
  // en-US abbreviations ('Sep', not 'Sept') are the most consistent across runtimes.
  watDayFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const parts = watDayFormatter.formatToParts(new Date(timeOf(d)));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}, ${formatWatClock(d)}`;
}

/** The calendar date `n` days after (or before, if negative) `date`. */
export function addDays(date: string, n: number): string {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Days must be a whole number, got ${n}.`);
  return utcCalendarDate(parseCalendarDate(date) + n * DAY_MS);
}

/** Every date from `start` to `end`, both included. Empty when `end` is before `start`. */
export function datesBetween(start: string, end: string): string[] {
  const from = parseCalendarDate(start);
  const to = parseCalendarDate(end);
  const dates: string[] = [];
  for (let ms = from; ms <= to; ms += DAY_MS) dates.push(utcCalendarDate(ms));
  return dates;
}
