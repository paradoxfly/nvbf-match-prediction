import {
  DEFAULT_ENTRY_FEE_KOBO,
  DEFAULT_FORMAT,
  DEFAULT_JACKPOT_BPS,
  DEFAULT_PRIZE_BPS,
  DEFAULT_PRIZE_TIERS_BPS,
  DEFAULT_SCORING,
  DEFAULT_TIE_BREAKERS,
  FIVB_POINTS,
  validatePrizeTiers,
} from '@predict/domain';
import { z } from 'zod';
import { Bps, Kobo } from './common';
import { TieBreaker } from './enums';

export const MatchFormat = z.object({
  bestOf: z.union([z.literal(3), z.literal(5)]),
  setTarget: z.number().int().min(5).max(50),
  decidingSetTarget: z.number().int().min(5).max(50),
});
export type MatchFormat = z.infer<typeof MatchFormat>;

export const ScoringConfig = z.object({
  winner: z.number().int().min(0).max(100),
  setCount: z.number().int().min(0).max(100),
  exactScore: z.number().int().min(0).max(100),
  bonusNeedsWinner: z.boolean(),
});
export type ScoringConfig = z.infer<typeof ScoringConfig>;

export const PrizeTiers = z
  .array(z.number().int())
  .min(1)
  .max(100)
  .superRefine((tiers, ctx) => {
    for (const message of validatePrizeTiers(tiers)) ctx.addIssue({ code: 'custom', message });
  });

/**
 * Everything that decides money and ranking for one match-day. Copied from the league's defaults
 * when the day is created, editable until the day opens, then frozen.
 */
export const DayConfig = z.object({
  entryFeeKobo: Kobo.min(100, { error: 'The entry fee must be at least ₦1.' }),
  /** Share of entry fees that becomes prize money. */
  prizeBps: Bps,
  /** Share of that prize money that goes to the league jackpot. */
  jackpotBps: Bps,
  prizeTiersBps: PrizeTiers,
  scoring: ScoringConfig,
  format: MatchFormat,
  tieBreakers: z.array(TieBreaker).max(3),
  /** Lock each match this many minutes before its scheduled start. */
  lockLeadMin: z.number().int().min(0).max(240),
  /** Fewest played matches for the day to count; null = half the day's matches, fixed at open. */
  minScoredMatches: z.number().int().min(1).max(50).nullable(),
});
export type DayConfig = z.infer<typeof DayConfig>;

export const DEFAULT_DAY_CONFIG: DayConfig = {
  entryFeeKobo: DEFAULT_ENTRY_FEE_KOBO,
  prizeBps: DEFAULT_PRIZE_BPS,
  jackpotBps: DEFAULT_JACKPOT_BPS,
  prizeTiersBps: [...DEFAULT_PRIZE_TIERS_BPS],
  scoring: { ...DEFAULT_SCORING },
  format: { ...DEFAULT_FORMAT },
  tieBreakers: [...DEFAULT_TIE_BREAKERS],
  lockLeadMin: 0,
  minScoredMatches: null,
};

/** League-table points per set result, keyed `${setsWon}-${setsLost}`. */
export const StandingsPointsSystem = z.record(
  z.string().regex(/^\d-\d$/),
  z.number().int().min(0).max(10),
);
export type StandingsPointsSystem = z.infer<typeof StandingsPointsSystem>;

export const DEFAULT_STANDINGS_POINTS: StandingsPointsSystem = { ...FIVB_POINTS };

/** The bank account players pay entry fees into. Shown on the payment screen. */
export const CollectionAccount = z.object({
  bankName: z.string().trim().min(2).max(80),
  accountNumber: z.string().regex(/^\d{10}$/, { error: 'Use the 10-digit account number.' }),
  accountName: z.string().trim().min(2).max(120),
});
export type CollectionAccount = z.infer<typeof CollectionAccount>;
