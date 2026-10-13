import { oc } from '@orpc/contract';
import { z } from 'zod';
import { IdParam, IsoDate, Kobo, Reason, pageOf, PageQuery, QueryFlag } from '../common';
import { CollectionAccount } from '../config';
import {
  ClaimStatus,
  ContributionSource,
  ContributionStatus,
  DayStatus,
  EntryStatus,
} from '../enums';
import { DayPublic, SetScoreView } from '../views';

// A player's entry into one day, their payment, and staff payment reconciliation.

export const ClaimView = z.object({
  id: z.uuid(),
  senderName: z.string(),
  senderBank: z.string().nullable(),
  amountKobo: Kobo,
  paidAt: z.date(),
  transferReference: z.string().nullable(),
  status: ClaimStatus,
  reviewNote: z.string().nullable(),
  createdAt: z.date(),
});
export type ClaimView = z.infer<typeof ClaimView>;

export const EntryView = z.object({
  id: z.uuid(),
  dayId: z.uuid(),
  date: z.string(),
  status: EntryStatus,
  /** Write this in the transfer narration / description. */
  paymentReference: z.string(),
  feeKobo: Kobo,
  creditedAt: z.date().nullable(),
  confirmedAt: z.date().nullable(),
  disqualified: z.boolean(),
  latestClaim: ClaimView.nullable(),
  createdAt: z.date(),
});
export type EntryView = z.infer<typeof EntryView>;

export const PredictionView = z.object({
  matchId: z.uuid(),
  sets: z.array(SetScoreView),
  homeSets: z.number().int(),
  awaySets: z.number().int(),
  savedAt: z.date(),
  /** False when the match locked before the payment arrived (it won't score). */
  counts: z.boolean(),
});
export type PredictionView = z.infer<typeof PredictionView>;

export const MyDayView = z.object({
  serverNow: z.date(),
  day: DayPublic,
  entry: EntryView.nullable(),
  predictions: z.array(PredictionView),
  /** Where to send the entry fee (only once the player has joined). */
  collectionAccount: CollectionAccount.nullable(),
});
export type MyDayView = z.infer<typeof MyDayView>;

export const SubmitClaimInput = IdParam.extend({
  senderName: z.string().trim().min(2).max(120),
  senderBank: z.string().trim().max(80).optional(),
  amountKobo: Kobo.min(100),
  paidAt: z.coerce.date(),
  transferReference: z.string().trim().max(80).optional(),
});
export type SubmitClaimInput = z.infer<typeof SubmitClaimInput>;

export const MyEntryListItem = EntryView.extend({
  dayTitle: z.string().nullable(),
  dayStatus: DayStatus,
  rank: z.number().int().nullable(),
  points: z.number().int().nullable(),
  prizeKobo: Kobo.nullable(),
});

const ENTRY_ERRORS = {
  DAY_NOT_OPEN: { status: 409, message: 'This day is not taking entries.' },
  ENTRY_CLOSED: { status: 409, message: 'Entries for this day have closed.' },
  ALREADY_CONFIRMED: { status: 409, message: 'Your payment is already confirmed.' },
} as const;

export const entriesContract = {
  myDay: oc
    .route({ method: 'GET', path: '/me/days/{date}', tags: ['entries'] })
    .input(z.object({ date: IsoDate }))
    .output(MyDayView),

  join: oc
    .route({ method: 'POST', path: '/me/days/{date}/join', tags: ['entries'] })
    .errors(ENTRY_ERRORS)
    .input(z.object({ date: IsoDate }))
    .output(EntryView),

  /** "I've sent the money": details that help staff find the transfer. */
  submitClaim: oc
    .route({ method: 'POST', path: '/me/entries/{id}/claim', tags: ['entries'] })
    .errors(ENTRY_ERRORS)
    .input(SubmitClaimInput)
    .output(EntryView),

  myEntries: oc
    .route({ method: 'GET', path: '/me/entries', tags: ['entries'] })
    .output(z.object({ items: z.array(MyEntryListItem) })),
};

// ---------------------------------------------------------------------------------------------
// Staff: payments

export const PaymentQueueItem = z.object({
  entryId: z.uuid(),
  paymentReference: z.string(),
  status: EntryStatus,
  feeKobo: Kobo,
  createdAt: z.date(),
  confirmedAt: z.date().nullable(),
  disqualified: z.boolean(),
  user: z.object({ id: z.uuid(), displayName: z.string(), phone: z.string() }),
  day: z.object({ id: z.uuid(), date: z.string(), status: z.string() }),
  latestClaim: ClaimView.nullable(),
  bankPaymentId: z.uuid().nullable(),
});
export type PaymentQueueItem = z.infer<typeof PaymentQueueItem>;

export const PaymentQueueQuery = PageQuery.extend({
  dayId: z.uuid().optional(),
  status: EntryStatus.optional(),
  /** Payment reference, display name, phone or sender name. */
  q: z.string().trim().max(80).optional(),
});

export const BankPaymentView = z.object({
  id: z.uuid(),
  bankReference: z.string().nullable(),
  amountKobo: Kobo,
  appliedKobo: Kobo,
  refundedKobo: Kobo,
  unappliedKobo: Kobo,
  creditedAt: z.date(),
  senderName: z.string().nullable(),
  narration: z.string().nullable(),
  note: z.string().nullable(),
  voided: z.boolean(),
  entries: z.array(z.object({ id: z.uuid(), paymentReference: z.string(), date: z.string() })),
  createdAt: z.date(),
});
export type BankPaymentView = z.infer<typeof BankPaymentView>;

/** The transfer as it appears on the bank statement. */
export const BankTransferInput = z.object({
  /** NIP session ID / transaction reference. Leave empty only for cash deposits (note required). */
  bankReference: z.string().trim().max(80).optional(),
  amountKobo: Kobo.min(1),
  creditedAt: z.coerce.date(),
  senderName: z.string().trim().max(120).optional(),
  narration: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});
export type BankTransferInput = z.infer<typeof BankTransferInput>;

export const ConfirmEntryInput = IdParam.extend({ transfer: BankTransferInput });
export type ConfirmEntryInput = z.infer<typeof ConfirmEntryInput>;

const PAYMENT_ERRORS = {
  BAD_STATUS: { status: 409, message: 'This entry or day is not in the right state for that.' },
  ALREADY_CONFIRMED: {
    status: 409,
    message: 'This entry is already confirmed with a different transfer.',
  },
  LATE_PAYMENT: {
    status: 409,
    message:
      'This transfer arrived after entries closed, so it cannot confirm the entry. Refund it instead.',
  },
  INSUFFICIENT_FUNDS: {
    status: 409,
    message: 'This transfer has no unused money left for this entry fee.',
    data: z.object({ unappliedKobo: z.number().int(), feeKobo: z.number().int() }),
  },
  TRANSFER_MISMATCH: {
    status: 409,
    message: 'That bank reference is already recorded with different details.',
  },
  TRANSFER_VOIDED: { status: 409, message: 'That transfer record was voided.' },
  CASH_NEEDS_NOTE: { status: 400, message: 'Add a note when there is no bank reference.' },
  CREDITED_IN_FUTURE: {
    status: 400,
    message: 'The credited time is in the future. Use the time on the bank statement.',
  },
} as const;

export const adminPaymentsContract = {
  queue: oc
    .route({ method: 'GET', path: '/admin/payments/queue', tags: ['admin-payments'] })
    .input(PaymentQueueQuery)
    .output(pageOf(PaymentQueueItem)),

  /** Records a transfer from the statement and applies it to the entry, in one step. */
  confirm: oc
    .route({ method: 'POST', path: '/admin/entries/{id}/confirm', tags: ['admin-payments'] })
    .errors(PAYMENT_ERRORS)
    .input(ConfirmEntryInput)
    .output(
      z.object({
        entry: PaymentQueueItem,
        transfer: BankPaymentView,
        /** Possible duplicates: same amount and sender within 15 minutes. */
        warnings: z.array(z.string()),
      }),
    ),

  rejectClaim: oc
    .route({ method: 'POST', path: '/admin/entries/{id}/reject-claim', tags: ['admin-payments'] })
    .errors(PAYMENT_ERRORS)
    .input(IdParam.extend({ reason: Reason }))
    .output(PaymentQueueItem),

  /** Undo a mistaken confirmation (super admins). The prize pool is topped up so it never shrinks. */
  revoke: oc
    .route({ method: 'POST', path: '/admin/entries/{id}/revoke', tags: ['admin-payments'] })
    .errors(PAYMENT_ERRORS)
    .input(IdParam.extend({ reason: Reason }))
    .output(PaymentQueueItem),

  /** Duplicate-account enforcement (super admins). The fee stays in the pool. */
  disqualify: oc
    .route({ method: 'POST', path: '/admin/entries/{id}/disqualify', tags: ['admin-payments'] })
    .errors(PAYMENT_ERRORS)
    .input(IdParam.extend({ reason: Reason, undo: z.boolean().default(false) }))
    .output(PaymentQueueItem),

  transfers: oc
    .route({ method: 'GET', path: '/admin/bank-payments', tags: ['admin-payments'] })
    .input(
      PageQuery.extend({
        unappliedOnly: QueryFlag.optional(),
        q: z.string().trim().max(80).optional(),
      }),
    )
    .output(pageOf(BankPaymentView)),

  /** Records money that came in without confirming anything (late, unknown sender, overpaid). */
  recordTransfer: oc
    .route({ method: 'POST', path: '/admin/bank-payments', tags: ['admin-payments'] })
    .errors(PAYMENT_ERRORS)
    .input(BankTransferInput)
    .output(z.object({ transfer: BankPaymentView, warnings: z.array(z.string()) })),

  voidTransfer: oc
    .route({ method: 'POST', path: '/admin/bank-payments/{id}/void', tags: ['admin-payments'] })
    .errors({
      ...PAYMENT_ERRORS,
      IN_USE: { status: 409, message: 'Money from this transfer is already applied.' },
    })
    .input(IdParam.extend({ reason: Reason }))
    .output(BankPaymentView),
};

// ---------------------------------------------------------------------------------------------
// Staff: extra prize money (sponsors, operator top-ups, rollovers)

export const ContributionView = z.object({
  id: z.uuid(),
  source: ContributionSource,
  status: ContributionStatus,
  dayId: z.uuid().nullable(),
  dayDate: z.string().nullable(),
  jackpotId: z.uuid().nullable(),
  amountKobo: Kobo,
  sponsorName: z.string().nullable(),
  sponsorLogoUrl: z.string().nullable(),
  sponsorUrl: z.string().nullable(),
  note: z.string().nullable(),
  receivedAt: z.date().nullable(),
  allocatedAt: z.date().nullable(),
  returnedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type ContributionView = z.infer<typeof ContributionView>;

export const CreateContributionInput = z
  .object({
    source: z.enum(['sponsor', 'operator']),
    dayId: z.uuid().optional(),
    jackpotId: z.uuid().optional(),
    amountKobo: Kobo.min(100),
    sponsorName: z.string().trim().max(120).optional(),
    sponsorLogoMediaId: z.uuid().optional(),
    sponsorUrl: z.url().max(300).optional(),
    note: z.string().trim().max(500).optional(),
    /** Money already in the account and committed now (otherwise it's only a pledge). */
    received: z.boolean(),
  })
  .refine((input) => Boolean(input.dayId) !== Boolean(input.jackpotId), {
    error: 'Choose either a match-day or the jackpot.',
  });
export type CreateContributionInput = z.infer<typeof CreateContributionInput>;

const CONTRIBUTION_ERRORS = {
  BAD_STATUS: { status: 409, message: 'That contribution is not in the right state for that.' },
  TARGET_CLOSED: {
    status: 409,
    message: 'That pool can no longer change (the day is final, or the jackpot is settled).',
  },
  MEDIA_NOT_READY: { status: 409, message: 'Upload the logo again before saving.' },
} as const;

export const adminContributionsContract = {
  list: oc
    .route({ method: 'GET', path: '/admin/contributions', tags: ['admin-contributions'] })
    .input(z.object({ dayId: z.uuid().optional(), jackpotId: z.uuid().optional() }))
    .output(z.object({ items: z.array(ContributionView) })),

  create: oc
    .route({ method: 'POST', path: '/admin/contributions', tags: ['admin-contributions'] })
    .errors(CONTRIBUTION_ERRORS)
    .input(CreateContributionInput)
    .output(ContributionView),

  /** A pledge has been paid: it now counts toward the guaranteed pool. */
  allocate: oc
    .route({
      method: 'POST',
      path: '/admin/contributions/{id}/allocate',
      tags: ['admin-contributions'],
    })
    .errors(CONTRIBUTION_ERRORS)
    .input(IdParam)
    .output(ContributionView),

  /** Returns or withdraws money before it is promised to players. */
  return: oc
    .route({
      method: 'POST',
      path: '/admin/contributions/{id}/return',
      tags: ['admin-contributions'],
    })
    .errors(CONTRIBUTION_ERRORS)
    .input(IdParam.extend({ reason: Reason }))
    .output(ContributionView),
};
