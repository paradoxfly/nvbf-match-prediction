import { z } from 'zod';

export const UserStatus = z.enum(['active', 'suspended']);
export type UserStatus = z.infer<typeof UserStatus>;

/**
 * Staff roles. Operations runs fixtures and results, finance handles money, super admins do
 * everything plus the irreversible steps (open, finalize, cancel, settle).
 */
export const AdminRole = z.enum(['super_admin', 'finance', 'operations']);
export type AdminRole = z.infer<typeof AdminRole>;

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super admin',
  finance: 'Finance',
  operations: 'Operations',
};

export const AdminStatus = z.enum(['active', 'disabled']);
export type AdminStatus = z.infer<typeof AdminStatus>;

/** The two competitions in a league; men's and women's matches share one daily pool. */
export const Category = z.enum(['men', 'women']);
export type Category = z.infer<typeof Category>;

export const CATEGORY_LABELS: Record<Category, string> = { men: 'Men', women: 'Women' };

export const LeagueStatus = z.enum(['draft', 'active', 'completed']);
export type LeagueStatus = z.infer<typeof LeagueStatus>;

export const DayStatus = z.enum([
  'draft',
  'published',
  'open',
  'closed',
  'finalized',
  'completed',
  'cancelled',
]);
export type DayStatus = z.infer<typeof DayStatus>;

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  draft: 'Draft',
  published: 'Coming up',
  open: 'Open',
  closed: 'Closed',
  finalized: 'Winners confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const MatchStatus = z.enum(['scheduled', 'final', 'void']);
export type MatchStatus = z.infer<typeof MatchStatus>;

export const ResultStatus = z.enum(['provisional', 'confirmed', 'superseded']);
export type ResultStatus = z.infer<typeof ResultStatus>;

export const EntryStatus = z.enum([
  'awaiting_payment',
  'payment_review',
  'confirmed',
  'expired',
  'refunded',
]);
export type EntryStatus = z.infer<typeof EntryStatus>;

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  awaiting_payment: 'Waiting for payment',
  payment_review: 'Checking your payment',
  confirmed: 'Confirmed',
  expired: 'Not confirmed',
  refunded: 'Refunded',
};

export const ClaimStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

export const ContributionSource = z.enum(['sponsor', 'operator', 'rollover']);
export type ContributionSource = z.infer<typeof ContributionSource>;

export const ContributionStatus = z.enum(['pledged', 'allocated', 'returned']);
export type ContributionStatus = z.infer<typeof ContributionStatus>;

export const ObligationKind = z.enum(['prize', 'refund', 'jackpot']);
export type ObligationKind = z.infer<typeof ObligationKind>;

export const ObligationStatus = z.enum([
  'awaiting_details',
  'ready',
  'processing',
  'paid',
  'details_invalid',
  'on_hold',
]);
export type ObligationStatus = z.infer<typeof ObligationStatus>;

/** Payout labels from the PRD, as players see them. */
export const OBLIGATION_STATUS_LABELS: Record<ObligationStatus, string> = {
  awaiting_details: 'Add your bank details',
  ready: 'Payment pending',
  processing: 'Payment in progress',
  paid: 'Paid',
  details_invalid: 'Check your bank details',
  on_hold: 'On hold',
};

export const PayoutAttemptStatus = z.enum(['pending', 'paid', 'failed']);
export type PayoutAttemptStatus = z.infer<typeof PayoutAttemptStatus>;

export const JackpotStatus = z.enum(['open', 'closed', 'settled', 'carried_over']);
export type JackpotStatus = z.infer<typeof JackpotStatus>;

export const MediaKind = z.enum(['team_logo', 'sponsor_logo']);
export type MediaKind = z.infer<typeof MediaKind>;

export const MediaStatus = z.enum(['pending', 'ready', 'rejected', 'deleted']);
export type MediaStatus = z.infer<typeof MediaStatus>;

export const SmsPurpose = z.enum(['otp', 'winner', 'payout_account_changed', 'notice']);
export type SmsPurpose = z.infer<typeof SmsPurpose>;

export const SmsStatus = z.enum(['queued', 'sent', 'failed']);
export type SmsStatus = z.infer<typeof SmsStatus>;

export const TieBreaker = z.enum(['closeness', 'exactScores', 'correctWinners']);
export type TieBreaker = z.infer<typeof TieBreaker>;

export const TIE_BREAKER_LABELS: Record<TieBreaker, string> = {
  closeness: 'Closest set scores',
  exactScores: 'Most exact set scores',
  correctWinners: 'Most correct winners',
};
