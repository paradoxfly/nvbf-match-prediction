import { oc } from '@orpc/contract';
import { z } from 'zod';
import { IsoDate } from '../common';
import { PublicJackpot } from './public';
import { Category } from '../enums';
import { SetScoreView, TeamRef } from '../views';

// Saving daily picks, and the league jackpot (predicting the final tables).

export const PredictionInput = z.object({
  matchId: z.uuid(),
  /** Every set in order, e.g. [{home:25,away:21},{home:23,away:25},…]. */
  sets: z.array(SetScoreView).min(1).max(5),
});
export type PredictionInput = z.infer<typeof PredictionInput>;

export const SavePredictionsInput = z.object({
  date: IsoDate,
  predictions: z.array(PredictionInput).min(1).max(40),
});
export type SavePredictionsInput = z.infer<typeof SavePredictionsInput>;

export const PickRejection = z.enum(['LOCKED', 'INVALID', 'UNKNOWN_MATCH']);

export const SavePredictionsResult = z.object({
  saved: z.array(z.object({ matchId: z.uuid(), savedAt: z.date(), changed: z.boolean() })),
  rejected: z.array(z.object({ matchId: z.uuid(), reason: PickRejection, message: z.string() })),
});
export type SavePredictionsResult = z.infer<typeof SavePredictionsResult>;

export const predictionsContract = {
  /**
   * Saves picks in one go (idempotent). Each match is checked on its own: a locked match is
   * reported back without failing the others. Joins the day automatically if needed.
   */
  save: oc
    .route({ method: 'PUT', path: '/me/days/{date}/predictions', tags: ['predictions'] })
    .errors({
      DAY_NOT_OPEN: { status: 409, message: 'This day is not taking predictions.' },
      ENTRY_CLOSED: { status: 409, message: 'Predictions for this day have closed.' },
      DISQUALIFIED: { status: 403, message: 'This entry was disqualified.' },
    })
    .input(SavePredictionsInput)
    .output(SavePredictionsResult),
};

// ---------------------------------------------------------------------------------------------
// Jackpot

export const JackpotOrders = z.object({
  men: z.array(z.uuid()).max(40).default([]),
  women: z.array(z.uuid()).max(40).default([]),
});
export type JackpotOrders = z.infer<typeof JackpotOrders>;

export const JackpotStandingView = z.object({
  position: z.number().int(),
  displayName: z.string(),
  distance: z.number().int(),
  mine: z.boolean(),
});

export const JackpotView = z.object({
  serverNow: z.date(),
  jackpot: PublicJackpot,
  /** The teams to order, per category, as the table currently stands. */
  tables: z.array(z.object({ category: Category, teams: z.array(TeamRef) })),
  /** After entries close: the ranking against the current (or final) standings. */
  ranking: z.array(JackpotStandingView),
  rankingFinal: z.boolean(),
  winner: z
    .object({ displayName: z.string(), distance: z.number().int(), amountKobo: z.number().int() })
    .nullable(),
});
export type JackpotView = z.infer<typeof JackpotView>;

export const MyJackpotView = z.object({
  orders: JackpotOrders.nullable(),
  /** When these tables were saved; each change resets it (earlier wins ties). */
  submittedAt: z.date().nullable(),
  /** Has at least one confirmed, paid daily entry in this league. */
  eligible: z.boolean(),
  /** True while entries are open: the player can enter, or change the tables they saved. */
  canSubmit: z.boolean(),
  /** Own position and distance once entries have closed. */
  position: z.number().int().nullable(),
  distance: z.number().int().nullable(),
});
export type MyJackpotView = z.infer<typeof MyJackpotView>;

export const jackpotContract = {
  view: oc
    .route({ method: 'GET', path: '/public/jackpot', tags: ['jackpot'] })
    .errors({ NO_JACKPOT: { status: 404, message: 'There is no jackpot running.' } })
    .output(JackpotView),

  mine: oc
    .route({ method: 'GET', path: '/me/jackpot', tags: ['jackpot'] })
    .errors({ NO_JACKPOT: { status: 404, message: 'There is no jackpot running.' } })
    .output(MyJackpotView),

  /**
   * Saves the predicted final tables: enters the jackpot, or changes the tables until entries
   * close. A change resets the saved time; sending the same tables again (a retry) keeps it.
   */
  submit: oc
    .route({ method: 'POST', path: '/me/jackpot', tags: ['jackpot'] })
    .errors({
      NO_JACKPOT: { status: 404, message: 'There is no jackpot running.' },
      JACKPOT_CLOSED: { status: 409, message: 'Jackpot predictions have closed.' },
      BAD_ORDER: {
        status: 400,
        message: 'Put every team in each table exactly once.',
      },
    })
    .input(z.object({ orders: JackpotOrders }))
    .output(MyJackpotView),
};
