import { oc } from '@orpc/contract';
import { z } from 'zod';
import { IdParam, Kobo, PageQuery, pageOf, Reason } from '../common';
import { ObligationKind, ObligationStatus, PayoutAttemptStatus } from '../enums';
import { NIGERIAN_BANKS } from '../banks';

// Winnings and refunds: where to pay, what we owe, and staff payout tracking.

export const PayoutAccountView = z.object({
  bankCode: z.string(),
  bankName: z.string(),
  /** Only the last 4 digits ever leave the API for players. */
  last4: z.string(),
  accountName: z.string(),
  activeFrom: z.date(),
});
export type PayoutAccountView = z.infer<typeof PayoutAccountView>;

export const MyPayoutAccount = z.object({
  current: PayoutAccountView.nullable(),
  /** A change waiting out its 24-hour safety delay. */
  pending: PayoutAccountView.nullable(),
});
export type MyPayoutAccount = z.infer<typeof MyPayoutAccount>;

export const SavePayoutAccountInput = z.object({
  bankCode: z.string().refine((code) => NIGERIAN_BANKS.some((bank) => bank.code === code), {
    error: 'Choose your bank from the list.',
  }),
  accountNumber: z.string().regex(/^\d{10}$/, { error: 'Enter your 10-digit account number.' }),
  accountName: z.string().trim().min(3).max(120),
});
export type SavePayoutAccountInput = z.infer<typeof SavePayoutAccountInput>;

export const MyObligation = z.object({
  id: z.uuid(),
  kind: ObligationKind,
  status: ObligationStatus,
  amountKobo: Kobo,
  /** The day (prizes and refunds of entries) or league (jackpot) it's for. */
  label: z.string(),
  rank: z.number().int().nullable(),
  statusNote: z.string().nullable(),
  paidAt: z.date().nullable(),
  createdAt: z.date(),
});
export type MyObligation = z.infer<typeof MyObligation>;

const ACCOUNT_ERRORS = {
  CHANGE_BLOCKED: {
    status: 409,
    message: 'A payment to your current account is in progress. Try again once it completes.',
  },
} as const;

export const payoutsContract = {
  banks: oc
    .route({ method: 'GET', path: '/public/banks', tags: ['payouts'] })
    .output(z.object({ items: z.array(z.object({ code: z.string(), name: z.string() })) })),

  myAccount: oc
    .route({ method: 'GET', path: '/me/payout-account', tags: ['payouts'] })
    .output(MyPayoutAccount),

  /**
   * Sets where winnings go. The first account works straight away; a change takes effect after
   * 24 hours and we email you about it, so someone else can't redirect your money quietly.
   * A correction after staff marked the details invalid counts straight away.
   */
  saveAccount: oc
    .route({ method: 'PUT', path: '/me/payout-account', tags: ['payouts'] })
    .errors(ACCOUNT_ERRORS)
    .input(SavePayoutAccountInput)
    .output(MyPayoutAccount),

  cancelPendingAccount: oc
    .route({ method: 'DELETE', path: '/me/payout-account/pending', tags: ['payouts'] })
    .output(MyPayoutAccount),

  myObligations: oc
    .route({ method: 'GET', path: '/me/obligations', tags: ['payouts'] })
    .output(z.object({ items: z.array(MyObligation) })),
};

// ---------------------------------------------------------------------------------------------
// Staff: payouts and refunds

export const PayoutAttemptView = z.object({
  id: z.uuid(),
  status: PayoutAttemptStatus,
  amountKobo: Kobo,
  bankName: z.string().nullable(),
  last4: z.string().nullable(),
  accountName: z.string().nullable(),
  nameEnquiryName: z.string().nullable(),
  transferReference: z.string().nullable(),
  failureReason: z.string().nullable(),
  startedAt: z.date(),
  completedAt: z.date().nullable(),
});

export const AdminObligation = z.object({
  id: z.uuid(),
  kind: ObligationKind,
  status: ObligationStatus,
  amountKobo: Kobo,
  label: z.string(),
  rank: z.number().int().nullable(),
  reason: z.string().nullable(),
  statusNote: z.string().nullable(),
  user: z
    .object({ id: z.uuid(), displayName: z.string(), email: z.string(), phone: z.string() })
    .nullable(),
  /** The account a payout would go to now (masked). */
  account: PayoutAccountView.nullable(),
  /** Several players paid into this same bank account: a duplicate-account signal. */
  sharedAccountUsers: z.number().int(),
  attempts: z.array(PayoutAttemptView),
  createdAt: z.date(),
});
export type AdminObligation = z.infer<typeof AdminObligation>;

const OBLIGATION_ERRORS = {
  BAD_STATUS: { status: 409, message: 'That payout is not in the right state for that.' },
  NO_ACCOUNT: { status: 409, message: 'The player has not added bank details yet.' },
  AMOUNT_MISMATCH: { status: 400, message: 'The amount must match what is owed exactly.' },
  DUPLICATE_REFERENCE: { status: 409, message: 'That transfer reference is already recorded.' },
} as const;

export const adminPayoutsContract = {
  list: oc
    .route({ method: 'GET', path: '/admin/obligations', tags: ['admin-payouts'] })
    .input(
      PageQuery.extend({
        status: ObligationStatus.optional(),
        kind: ObligationKind.optional(),
        dayId: z.uuid().optional(),
      }),
    )
    .output(pageOf(AdminObligation)),

  /** Shows the full account number (logged in the audit trail). */
  revealAccount: oc
    .route({
      method: 'POST',
      path: '/admin/obligations/{id}/reveal-account',
      tags: ['admin-payouts'],
    })
    .errors(OBLIGATION_ERRORS)
    .input(IdParam)
    .output(z.object({ bankName: z.string(), accountNumber: z.string(), accountName: z.string() })),

  /** Marks the transfer as started (after checking the name your bank shows). */
  start: oc
    .route({ method: 'POST', path: '/admin/obligations/{id}/start', tags: ['admin-payouts'] })
    .errors(OBLIGATION_ERRORS)
    .input(IdParam.extend({ nameEnquiryName: z.string().trim().min(2).max(120) }))
    .output(AdminObligation),

  markPaid: oc
    .route({ method: 'POST', path: '/admin/obligations/{id}/paid', tags: ['admin-payouts'] })
    .errors(OBLIGATION_ERRORS)
    .input(
      IdParam.extend({ transferReference: z.string().trim().min(3).max(80), amountKobo: Kobo }),
    )
    .output(AdminObligation),

  markFailed: oc
    .route({ method: 'POST', path: '/admin/obligations/{id}/failed', tags: ['admin-payouts'] })
    .errors(OBLIGATION_ERRORS)
    .input(IdParam.extend({ reason: Reason }))
    .output(AdminObligation),

  /** The name or number didn't check out: asks the player for new details. */
  invalidDetails: oc
    .route({
      method: 'POST',
      path: '/admin/obligations/{id}/invalid-details',
      tags: ['admin-payouts'],
    })
    .errors(OBLIGATION_ERRORS)
    .input(IdParam.extend({ reason: Reason }))
    .output(AdminObligation),

  hold: oc
    .route({ method: 'POST', path: '/admin/obligations/{id}/hold', tags: ['admin-payouts'] })
    .errors(OBLIGATION_ERRORS)
    .input(IdParam.extend({ reason: Reason, hold: z.boolean() }))
    .output(AdminObligation),

  /** Turns unused money on a transfer into a refund to its sender. */
  refundTransfer: oc
    .route({ method: 'POST', path: '/admin/bank-payments/{id}/refund', tags: ['admin-payouts'] })
    .errors({
      ...OBLIGATION_ERRORS,
      NOTHING_TO_REFUND: { status: 409, message: 'This transfer has no unused money.' },
    })
    .input(IdParam.extend({ reason: Reason, userId: z.uuid().optional() }))
    .output(AdminObligation),
};

// ---------------------------------------------------------------------------------------------
// Staff: jackpot settlement

export const JackpotAdminView = z.object({
  leagueId: z.uuid(),
  jackpotId: z.uuid(),
  status: z.string(),
  entryClosesAt: z.date(),
  amounts: z.object({
    fromDaysKobo: Kobo,
    contributionsKobo: Kobo,
    totalKobo: Kobo,
    finalKobo: Kobo.nullable(),
  }),
  entries: z.number().int(),
  eligibleEntries: z.number().int(),
  preview: z.array(
    z.object({
      position: z.number().int(),
      displayName: z.string(),
      distance: z.number().int(),
      submittedAt: z.date(),
    }),
  ),
  blockers: z.array(z.string()),
  winner: z
    .object({ displayName: z.string(), distance: z.number().int(), amountKobo: Kobo })
    .nullable(),
});
export type JackpotAdminView = z.infer<typeof JackpotAdminView>;

export const adminJackpotContract = {
  get: oc
    .route({ method: 'GET', path: '/admin/leagues/{id}/jackpot', tags: ['admin-jackpot'] })
    .input(IdParam)
    .output(JackpotAdminView),

  /** Picks the winner from the final standings and records what we owe them (super admins). */
  settle: oc
    .route({ method: 'POST', path: '/admin/leagues/{id}/jackpot/settle', tags: ['admin-jackpot'] })
    .errors({
      NOT_READY: {
        status: 409,
        message: 'The jackpot cannot be settled yet.',
        data: z.object({ blockers: z.array(z.string()) }),
      },
    })
    .input(IdParam)
    .output(JackpotAdminView),
};
