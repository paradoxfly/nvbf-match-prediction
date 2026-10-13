import { z } from 'zod';
import { Bps, Kobo } from './common';
import { DayConfig, MatchFormat, ScoringConfig } from './config';
import { Category, DayStatus, MatchStatus, TieBreaker } from './enums';

// Read models shared by several routers.

export const TeamRef = z.object({
  id: z.uuid(),
  name: z.string(),
  shortName: z.string(),
  category: Category,
  logoUrl: z.string().nullable(),
});
export type TeamRef = z.infer<typeof TeamRef>;

export const SetScoreView = z.object({ home: z.number().int(), away: z.number().int() });

export const ResultView = z.object({
  sets: z.array(SetScoreView),
  homeSets: z.number().int(),
  awaySets: z.number().int(),
});
export type ResultView = z.infer<typeof ResultView>;

export const MatchView = z.object({
  id: z.uuid(),
  category: Category,
  home: TeamRef,
  away: TeamRef,
  scheduledAt: z.date(),
  /** When predictions for this match stop being accepted. */
  lockAt: z.date(),
  locked: z.boolean(),
  status: MatchStatus,
  voidReason: z.string().nullable(),
  venue: z.string().nullable(),
  /** The confirmed result, once there is one. */
  result: ResultView.nullable(),
});
export type MatchView = z.infer<typeof MatchView>;

/** What a day's money looks like right now (live) or at finalization (frozen). */
export const PoolView = z.object({
  confirmedEntries: z.number().int(),
  entryFeeKobo: Kobo,
  revenueKobo: Kobo,
  participantShareKobo: Kobo,
  jackpotCutKobo: Kobo,
  contributionsKobo: Kobo,
  /** What the day's winners share: participant share − jackpot cut + contributions. */
  dailyPoolKobo: Kobo,
  /** Current amount per prize place (for the places that would be paid right now). */
  placeAmountsKobo: z.array(Kobo),
  /** Full published table, if every place had a winner. */
  fullTableKobo: z.array(Kobo),
  final: z.boolean(),
});
export type PoolView = z.infer<typeof PoolView>;

export const SponsorView = z.object({
  name: z.string(),
  logoUrl: z.string().nullable(),
  url: z.string().nullable(),
  amountKobo: Kobo,
});
export type SponsorView = z.infer<typeof SponsorView>;

/** The published settings of a day, as players see them. */
export const DayRulesSummary = z.object({
  entryFeeKobo: Kobo,
  prizeBps: Bps,
  jackpotBps: Bps,
  prizeTiersBps: z.array(z.number().int()),
  scoring: ScoringConfig,
  format: MatchFormat,
  tieBreakers: z.array(TieBreaker),
  lockLeadMin: z.number().int(),
});
export type DayRulesSummary = z.infer<typeof DayRulesSummary>;

export const DayPublic = z.object({
  id: z.uuid(),
  date: z.string(),
  title: z.string().nullable(),
  status: DayStatus,
  leagueName: z.string(),
  opensAt: z.date().nullable(),
  submissionsCloseAt: z.date().nullable(),
  closedAt: z.date().nullable(),
  /** When the last chance to get a pick in ends (null when nothing is open). */
  entryCutoff: z.date().nullable(),
  settings: DayRulesSummary,
  matches: z.array(MatchView),
  pool: PoolView,
  sponsors: z.array(SponsorView),
  /** Pledged-but-unpaid sponsor money, never part of the guaranteed pool. */
  pledgedKobo: Kobo,
  updatedAt: z.date(),
});
export type DayPublic = z.infer<typeof DayPublic>;

export const DayCard = z.object({
  id: z.uuid(),
  date: z.string(),
  title: z.string().nullable(),
  status: DayStatus,
  matchCount: z.number().int(),
  confirmedEntries: z.number().int(),
  dailyPoolKobo: Kobo,
});
export type DayCard = z.infer<typeof DayCard>;

export const DayConfigWithTiming = DayConfig.extend({
  title: z.string().nullable(),
  opensAt: z.date().nullable(),
  submissionsCloseAt: z.date().nullable(),
});
