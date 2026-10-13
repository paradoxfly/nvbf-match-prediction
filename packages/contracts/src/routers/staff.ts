import { oc } from '@orpc/contract';
import { z } from 'zod';
import { IdParam, Kobo, PageQuery, pageOf, Reason, QueryFlag } from '../common';
import { EntryStatus, UserStatus } from '../enums';

// Staff tools: players (search, suspend, duplicate signals), the audit log and money reports.

export const AdminPlayer = z.object({
  id: z.uuid(),
  displayName: z.string(),
  phone: z.string(),
  status: UserStatus,
  statusReason: z.string().nullable(),
  createdAt: z.date(),
  lastLoginAt: z.date().nullable(),
  entries: z.number().int(),
  confirmedEntries: z.number().int(),
  /** Other players whose payout bank account matches this player's (possible duplicates). */
  sharedAccountWith: z.array(z.object({ id: z.uuid(), displayName: z.string() })),
});
export type AdminPlayer = z.infer<typeof AdminPlayer>;

export const AdminPlayerDetail = AdminPlayer.extend({
  entryHistory: z.array(
    z.object({
      entryId: z.uuid(),
      date: z.string(),
      status: EntryStatus,
      paymentReference: z.string(),
      disqualified: z.boolean(),
    }),
  ),
});
export type AdminPlayerDetail = z.infer<typeof AdminPlayerDetail>;

export const AuditEntryView = z.object({
  id: z.uuid(),
  createdAt: z.date(),
  actorType: z.enum(['user', 'admin', 'system']),
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  reason: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEntryView = z.infer<typeof AuditEntryView>;

export const LedgerTotals = z.object({
  collections: z.number().int(),
  contributions: z.number().int(),
  prizesAwarded: z.number().int(),
  jackpotCut: z.number().int(),
  jackpotAwarded: z.number().int(),
  operations: z.number().int(),
  refundsOwed: z.number().int(),
  payoutsPaid: z.number().int(),
  refundsPaid: z.number().int(),
});
export type LedgerTotals = z.infer<typeof LedgerTotals>;

export const DayReconciliation = z.object({
  dayId: z.uuid(),
  date: z.string(),
  status: z.string(),
  totals: LedgerTotals,
  /** Prizes and refunds still to send for this day. */
  outstandingKobo: Kobo,
  /** For a finalized day: collections + contributions = prizes + jackpot cut + operations. */
  balanced: z.boolean().nullable(),
});
export type DayReconciliation = z.infer<typeof DayReconciliation>;

export const ReconciliationReport = z.object({
  days: z.array(DayReconciliation),
  totals: LedgerTotals,
  /** Money received on the bank statement vs used for entries, refunded, or still unused. */
  transfers: z.object({
    receivedKobo: Kobo,
    appliedKobo: Kobo,
    refundedKobo: Kobo,
    unappliedKobo: Kobo,
  }),
  generatedAt: z.date(),
});
export type ReconciliationReport = z.infer<typeof ReconciliationReport>;

export const adminPlayersContract = {
  list: oc
    .route({ method: 'GET', path: '/admin/players', tags: ['admin-players'] })
    .input(
      PageQuery.extend({
        q: z.string().trim().max(80).optional(),
        status: UserStatus.optional(),
        /** Only players who share a payout bank account with someone else. */
        sharedAccountsOnly: QueryFlag.optional(),
      }),
    )
    .output(pageOf(AdminPlayer)),

  get: oc
    .route({ method: 'GET', path: '/admin/players/{id}', tags: ['admin-players'] })
    .input(IdParam)
    .output(AdminPlayerDetail),

  /** Suspends (signs out everywhere) or reinstates a player (super admins). */
  setStatus: oc
    .route({ method: 'POST', path: '/admin/players/{id}/status', tags: ['admin-players'] })
    .input(IdParam.extend({ status: UserStatus, reason: Reason }))
    .output(AdminPlayerDetail),
};

export const adminAuditContract = {
  list: oc
    .route({ method: 'GET', path: '/admin/audit', tags: ['admin-audit'] })
    .input(
      PageQuery.extend({
        targetType: z.string().max(40).optional(),
        targetId: z.string().max(80).optional(),
        action: z.string().max(80).optional(),
      }),
    )
    .output(pageOf(AuditEntryView)),
};

export const adminReportsContract = {
  reconciliation: oc
    .route({ method: 'GET', path: '/admin/reports/reconciliation', tags: ['admin-reports'] })
    .input(z.object({ leagueId: z.uuid().optional() }))
    .output(ReconciliationReport),
};
