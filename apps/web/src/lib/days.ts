import type { DayStatus } from '@predict/contracts';

/** Day statuses that have (or will soon have) a leaderboard: open, closed and final days. */
export const BOARD_STATUSES: ReadonlySet<string> = new Set<DayStatus>([
  'open',
  'closed',
  'finalized',
  'completed',
]);
