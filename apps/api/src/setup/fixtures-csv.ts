import Papa from 'papaparse';
import type { Category } from '@predict/contracts';

/** One fixture line as typed in the CSV, before team matching. */
export interface FixtureLine {
  line: number;
  date: string;
  time: string;
  category: Category | null;
  home: string;
  away: string;
  venue: string | null;
  /** Problems found while reading the line itself (not yet about teams or days). */
  errors: string[];
}

const DEFAULT_COLUMNS = ['date', 'time', 'category', 'home', 'away', 'venue'] as const;
type Column = (typeof DEFAULT_COLUMNS)[number];

const CATEGORY_ALIASES: Record<string, Category> = {
  men: 'men',
  "men's": 'men',
  mens: 'men',
  m: 'men',
  male: 'men',
  women: 'women',
  "women's": 'women',
  womens: 'women',
  w: 'women',
  f: 'women',
  female: 'women',
};

/** `2026-10-18`, `18/10/2026` or `18-10-2026` (day first, as in Nigeria) → `2026-10-18`. */
export function parseCsvDate(raw: string): string | null {
  const value = raw.trim();
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
    if (!match) return null;
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** `16:00`, `4:00 pm`, `4pm`, `4.30pm` → `16:00` (24-hour). */
export function parseCsvTime(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/\s+/g, '');
  const match = /^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/.exec(value);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (!meridiem && !match[2]) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseCategory(raw: string): Category | null {
  return CATEGORY_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** Reads the CSV into lines. A header row (any order of the known columns) is optional. */
export function readFixtureCsv(csv: string): FixtureLine[] {
  const parsed = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: 'greedy' });
  const rows = parsed.data.map((row) => row.map((cell) => (cell ?? '').trim()));
  if (rows.length === 0) return [];

  let columns: Column[] = [...DEFAULT_COLUMNS];
  let start = 0;
  const first = rows[0]!.map((cell) => cell.toLowerCase());
  if (first.includes('date') && first.includes('home')) {
    columns = first.map((cell) =>
      (DEFAULT_COLUMNS as readonly string[]).includes(cell) ? cell : '',
    ) as Column[];
    start = 1;
  }
  const index = (column: Column) => columns.indexOf(column);

  return rows.slice(start).map((row, offset) => {
    const cell = (column: Column) => {
      const at = index(column);
      return at >= 0 ? (row[at] ?? '') : '';
    };
    const errors: string[] = [];
    const rawDate = cell('date');
    const rawTime = cell('time');
    const rawCategory = cell('category');
    const date = parseCsvDate(rawDate);
    const time = parseCsvTime(rawTime);
    const category = rawCategory ? parseCategory(rawCategory) : null;
    if (!date) errors.push(`"${rawDate}" is not a date (use 2026-10-18 or 18/10/2026).`);
    if (!time) errors.push(`"${rawTime}" is not a time (use 16:00 or 4:00 pm).`);
    if (rawCategory && !category) errors.push(`"${rawCategory}" is not a category (men or women).`);
    if (!cell('home') || !cell('away')) errors.push('Both teams are required.');
    return {
      line: start + offset + 1,
      date: date ?? rawDate,
      time: time ?? rawTime,
      category,
      home: cell('home'),
      away: cell('away'),
      venue: cell('venue') || null,
      errors,
    };
  });
}
