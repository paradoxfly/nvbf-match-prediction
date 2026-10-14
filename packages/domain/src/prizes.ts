// Prize pool, prize split and naira formatting. All money is integer kobo (₦1 = 100 kobo).

import type { Award, PoolBreakdown, PoolInput, PrizeAllocation, RankedEntry } from './types';

/** Basis points in 100%. */
export const BPS = 10_000;
/** 80% of entry fees is prize money. */
export const DEFAULT_PRIZE_BPS = 8000;
/** 10% of the prize money goes to the league jackpot. */
export const DEFAULT_JACKPOT_BPS = 1000;
/** Top 10 split: 40%, 20%, 12.5%, 7.5%, 5%, 4%, 3%, 3%, 2.5%, 2.5%. */
export const DEFAULT_PRIZE_TIERS_BPS = [4000, 2000, 1250, 750, 500, 400, 300, 300, 250, 250];
/** ₦1,000. */
export const DEFAULT_ENTRY_FEE_KOBO = 100_000;
/** Most prize places a day can have. */
export const MAX_PRIZE_PLACES = 100;

const BIG_BPS = BigInt(BPS);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Throws unless `value` is a whole, non-negative, safe number of kobo. */
export function assertKobo(value: unknown, label = 'Amount'): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${label} must be a whole number of kobo (0 or more), got ${String(value)}.`,
    );
  }
}

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a whole number (0 or more), got ${value}.`);
  }
}

function assertBps(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > BPS) {
    throw new RangeError(`${label} must be whole basis points from 0 to ${BPS}, got ${value}.`);
  }
}

function toKobo(value: bigint, label: string): number {
  if (value < 0n || value > MAX_SAFE) {
    throw new RangeError(`${label} is outside the safe range for kobo amounts.`);
  }
  return Number(value);
}

/** Basis points as a percentage for people: 8000 → '80%', 1250 → '12.5%', 5 → '0.05%'. */
export function formatBps(bps: number): string {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new RangeError(`Basis points must be a whole number (0 or more), got ${bps}.`);
  }
  const whole = Math.floor(bps / 100);
  const hundredths = bps % 100;
  if (hundredths === 0) return `${whole}%`;
  return `${whole}.${String(hundredths).padStart(2, '0').replace(/0$/, '')}%`;
}

/** Splits confirmed entry money into prize money, the jackpot cut and operations, rounding down. */
export function computePool(input: PoolInput): PoolBreakdown {
  assertCount(input.confirmedCount, 'confirmedCount');
  assertKobo(input.entryFeeKobo, 'entryFeeKobo');
  assertKobo(input.contributionsKobo, 'contributionsKobo');
  assertBps(input.prizeBps, 'prizeBps');
  assertBps(input.jackpotBps, 'jackpotBps');

  const revenue = BigInt(input.confirmedCount) * BigInt(input.entryFeeKobo);
  const participantShare = (revenue * BigInt(input.prizeBps)) / BIG_BPS;
  const jackpotCut = (participantShare * BigInt(input.jackpotBps)) / BIG_BPS;
  const dailyPool = participantShare - jackpotCut + BigInt(input.contributionsKobo);

  return {
    revenueKobo: toKobo(revenue, 'Entry revenue'),
    participantShareKobo: toKobo(participantShare, 'Participant share'),
    jackpotCutKobo: toKobo(jackpotCut, 'Jackpot cut'),
    contributionsKobo: input.contributionsKobo,
    dailyPoolKobo: toKobo(dailyPool, 'Daily pool'),
    operationsKobo: toKobo(revenue - participantShare, 'Operations share'),
  };
}

/**
 * Splits `totalKobo` in proportion to `weights` so the parts always add up to the total exactly.
 * Each part gets its rounded-down share; leftover kobo go one at a time to the largest
 * remainders, ties to the lower index.
 */
export function largestRemainder(totalKobo: number, weights: readonly number[]): number[] {
  assertKobo(totalKobo, 'totalKobo');
  if (weights.length === 0) throw new Error('Need at least one weight to split an amount.');
  let weightSum = 0n;
  for (const weight of weights) {
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(`Weights must be whole numbers (0 or more), got ${weight}.`);
    }
    weightSum += BigInt(weight);
  }
  if (weightSum === 0n) throw new Error('Weights must add up to more than 0.');

  const total = BigInt(totalKobo);
  const parts = weights.map((weight, index) => {
    const product = total * BigInt(weight);
    return { index, amount: product / weightSum, remainder: product % weightSum };
  });
  let leftover = total - parts.reduce((sum, part) => sum + part.amount, 0n);
  const byRemainder = [...parts].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.index - b.index;
  });
  for (const part of byRemainder) {
    if (leftover === 0n) break;
    part.amount += 1n;
    leftover -= 1n;
  }
  return parts.map((part) => Number(part.amount));
}

/** Problems with a prize split, in plain English. An empty list means the split is valid. */
export function validatePrizeTiers(tiersBps: readonly number[]): string[] {
  if (tiersBps.length === 0) return ['Add at least one prize place.'];

  const problems: string[] = [];
  if (tiersBps.length > MAX_PRIZE_PLACES) {
    problems.push(
      `There can be at most ${MAX_PRIZE_PLACES} prize places, but there are ${tiersBps.length}.`,
    );
  }
  let sum = 0;
  let allPositiveWhole = true;
  for (const [index, bps] of tiersBps.entries()) {
    const place = `${ordinal(index + 1)} place`;
    if (!Number.isSafeInteger(bps)) {
      problems.push(`${place} must be a whole number of basis points (steps of 0.01%).`);
      allPositiveWhole = false;
      continue;
    }
    if (bps <= 0) {
      problems.push(`${place} must get more than 0%.`);
      allPositiveWhole = false;
      continue;
    }
    sum += bps;
    const above = tiersBps[index - 1];
    if (above !== undefined && Number.isSafeInteger(above) && above > 0 && bps > above) {
      problems.push(
        `${place} (${formatBps(bps)}) gets more than ${ordinal(index)} place (${formatBps(above)}). ` +
          'A lower place can never get more than a higher place.',
      );
    }
  }
  if (allPositiveWhole && sum !== BPS) {
    problems.push(`The places add up to ${formatBps(sum)}. They must add up to exactly 100%.`);
  }
  return problems;
}

function assertPrizeTiers(tiersBps: readonly number[]): void {
  const problems = validatePrizeTiers(tiersBps);
  if (problems.length > 0) throw new Error(`Invalid prize split: ${problems.join(' ')}`);
}

/**
 * Kobo for each paid place. Only as many places as there are eligible players are paid; with
 * fewer players than places, the unused share is spread over the paid places in proportion.
 */
export function placeAmounts(
  poolKobo: number,
  tiersBps: readonly number[],
  eligibleCount: number,
): number[] {
  assertKobo(poolKobo, 'poolKobo');
  assertCount(eligibleCount, 'eligibleCount');
  assertPrizeTiers(tiersBps);
  const paidPlaces = Math.min(tiersBps.length, eligibleCount);
  if (paidPlaces === 0) return [];
  return largestRemainder(poolKobo, tiersBps.slice(0, paidPlaces));
}

/** Checks `ranked` is in rank order with consistent tie groups covering positions 1..n. */
function assertRankedGroups(ranked: readonly RankedEntry[]): void {
  const ids = new Set<string>();
  let index = 0;
  while (index < ranked.length) {
    const first = ranked[index];
    if (first === undefined) break;
    const { groupStart, groupEnd, groupSize } = first;
    const valid =
      Number.isSafeInteger(groupSize) &&
      groupSize >= 1 &&
      groupStart === index + 1 &&
      groupEnd === groupStart + groupSize - 1 &&
      groupEnd <= ranked.length;
    if (!valid) {
      throw new Error(`Ranked entries are out of order or have inconsistent tie groups.`);
    }
    for (const entry of ranked.slice(index, index + groupSize)) {
      if (
        entry.groupStart !== groupStart ||
        entry.groupEnd !== groupEnd ||
        entry.groupSize !== groupSize ||
        entry.rank !== groupStart
      ) {
        throw new Error(`Entry ${entry.entryId} does not match its tie group.`);
      }
      if (ids.has(entry.entryId)) throw new Error(`Entry ${entry.entryId} is ranked twice.`);
      ids.add(entry.entryId);
    }
    index += groupSize;
  }
}

/**
 * Prize money per entry. A tie group shares the places it covers equally; kobo that can't be
 * split equally go to operations. Groups starting after the last paid place get nothing.
 * Awards plus rounding always add up to the pool when anyone is ranked; with nobody ranked
 * nothing is paid and the caller decides what happens to the pool.
 */
export function allocatePrizes(
  poolKobo: number,
  tiersBps: readonly number[],
  ranked: readonly RankedEntry[],
): PrizeAllocation {
  const amounts = placeAmounts(poolKobo, tiersBps, ranked.length);
  assertRankedGroups(ranked);
  const paidPlaces = amounts.length;

  const awards: Award[] = [];
  let roundingToOpsKobo = 0;
  let index = 0;
  while (index < ranked.length) {
    const first = ranked[index];
    if (first === undefined || first.groupStart > paidPlaces) break;
    const group = ranked.slice(index, index + first.groupSize);
    index += first.groupSize;

    let groupTotal = 0;
    for (let place = first.groupStart; place <= Math.min(first.groupEnd, paidPlaces); place += 1) {
      groupTotal += amounts[place - 1] ?? 0;
    }
    const share = Math.floor(groupTotal / group.length);
    roundingToOpsKobo += groupTotal - share * group.length;
    for (const entry of group) {
      awards.push({ entryId: entry.entryId, rank: entry.rank, amountKobo: share });
    }
  }
  return { awards, roundingToOpsKobo, placeAmountsKobo: amounts };
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** '₦1,234' for whole naira, '₦1,234.50' otherwise; `kobo: true` always shows the kobo. */
export function formatNaira(kobo: number, opts: { kobo?: boolean } = {}): string {
  if (!Number.isSafeInteger(kobo)) {
    throw new RangeError(`Amount must be a whole number of kobo, got ${kobo}.`);
  }
  const sign = kobo < 0 ? '-' : '';
  const abs = Math.abs(kobo);
  const naira = groupThousands(String(Math.floor(abs / 100)));
  const rest = abs % 100;
  if (rest === 0 && opts.kobo !== true) return `${sign}₦${naira}`;
  return `${sign}₦${naira}.${String(rest).padStart(2, '0')}`;
}

const NAIRA_PATTERN = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

/**
 * Parses an admin-typed naira amount exactly: '500', '1,234.5', '₦2,000.05', 'N500'.
 * Throws on negatives, more than 2 decimal places, or anything that isn't an amount.
 */
export function nairaToKobo(input: string | number): number {
  let text: string;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error(`${input} is not a naira amount.`);
    text = String(input);
  } else if (typeof input === 'string') {
    text = input;
  } else {
    throw new TypeError('A naira amount must be a string or a number.');
  }

  const cleaned = text.trim().replace(/^(?:₦|NGN|N)\s*/i, '');
  if (cleaned.startsWith('-')) throw new RangeError(`The amount can't be negative: "${text}".`);
  const match = NAIRA_PATTERN.exec(cleaned);
  if (match === null) {
    throw new Error(`"${text}" is not a naira amount. Use digits, like 1,500 or 1500.50.`);
  }
  const whole = (match[1] ?? '').replaceAll(',', '');
  const fraction = match[2] ?? '';
  if (fraction.length > 2) {
    throw new RangeError(`"${text}" has more than 2 decimal places; kobo only go to 2 places.`);
  }
  const kobo = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return toKobo(kobo, `"${text}"`);
}

/** 1 → '1st', 2 → '2nd', 11 → '11th', 22 → '22nd'. */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
