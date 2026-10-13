import { oc } from '@orpc/contract';
import { z } from 'zod';
import { IsoDate } from '../common';
import { Category, JackpotStatus } from '../enums';
import { DayCard, DayPublic, TeamRef } from '../views';

// Everything a visitor can see without signing in. No phone numbers or bank details, ever.

export const RulesSection = z.object({
  id: z.string(),
  title: z.string(),
  paragraphs: z.array(z.string()),
  bullets: z.array(z.string()).optional(),
  example: z.object({ title: z.string(), lines: z.array(z.string()) }).optional(),
});

export const RulesDocumentView = z.object({
  sections: z.array(RulesSection),
  /** The day these rules belong to, or null for the league's defaults. */
  date: z.string().nullable(),
  hash: z.string(),
});
export type RulesDocumentView = z.infer<typeof RulesDocumentView>;

export const PublicJackpot = z.object({
  leagueName: z.string(),
  status: JackpotStatus,
  entryClosesAt: z.date(),
  /** Money already in the jackpot (finalized days + committed sponsor money). */
  guaranteedKobo: z.number().int(),
  /** Today's share, added once today's results are final. */
  pendingKobo: z.number().int(),
  entries: z.number().int(),
});
export type PublicJackpot = z.infer<typeof PublicJackpot>;

export const HomeView = z.object({
  serverNow: z.date(),
  leagueName: z.string().nullable(),
  /** Today's day if there is one, otherwise the next one coming up, otherwise the latest. */
  featured: DayPublic.nullable(),
  days: z.array(DayCard),
  jackpot: PublicJackpot.nullable(),
  standingsPublic: z.boolean(),
});
export type HomeView = z.infer<typeof HomeView>;

export const StandingsRowView = z.object({
  position: z.number().int(),
  team: TeamRef,
  played: z.number().int(),
  lost: z.number().int(),
  setsWon: z.number().int(),
  setsLost: z.number().int(),
  points: z.number().int(),
});
export type StandingsRowView = z.infer<typeof StandingsRowView>;

export const StandingsView = z.object({
  leagueName: z.string(),
  updatedAt: z.date().nullable(),
  final: z.boolean(),
  tables: z.array(z.object({ category: Category, rows: z.array(StandingsRowView) })),
});
export type StandingsView = z.infer<typeof StandingsView>;

const tags = ['public'];

export const publicContract = {
  home: oc.route({ method: 'GET', path: '/public/home', tags }).output(HomeView),

  day: oc
    .route({ method: 'GET', path: '/public/days/{date}', tags })
    .input(z.object({ date: IsoDate }))
    .output(DayPublic.extend({ serverNow: z.date() })),

  /** The rules for one day (frozen once it opened), or the current league's defaults. */
  rules: oc
    .route({ method: 'GET', path: '/public/rules', tags })
    .input(z.object({ date: IsoDate.optional() }))
    .output(RulesDocumentView),

  standings: oc
    .route({ method: 'GET', path: '/public/standings', tags })
    .errors({ NOT_PUBLISHED: { status: 404, message: 'Standings are not published yet.' } })
    .output(StandingsView),
};
