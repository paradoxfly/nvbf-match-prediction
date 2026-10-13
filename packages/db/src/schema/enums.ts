import {
  AdminRole,
  AdminStatus,
  Category,
  ClaimStatus,
  ContributionSource,
  ContributionStatus,
  DayStatus,
  EmailPurpose,
  EmailStatus,
  EntryStatus,
  JackpotStatus,
  LeagueStatus,
  MatchStatus,
  MediaKind,
  MediaStatus,
  ObligationKind,
  ObligationStatus,
  PayoutAttemptStatus,
  ResultStatus,
  UserStatus,
} from '@predict/contracts';
import { pgEnum } from 'drizzle-orm/pg-core';

/** zod 4 types `.options` as a plain array; pgEnum needs a non-empty tuple. */
const values = <T extends string>(zodEnum: { options: readonly T[] }) =>
  zodEnum.options as unknown as [T, ...T[]];

// Postgres enums mirror the zod enums in @predict/contracts, so both stay in lockstep.
export const userStatus = pgEnum('user_status', values(UserStatus));
export const adminRole = pgEnum('admin_role', values(AdminRole));
export const adminStatus = pgEnum('admin_status', values(AdminStatus));
export const actorType = pgEnum('actor_type', ['user', 'admin', 'system']);
export const category = pgEnum('category', values(Category));
export const leagueStatus = pgEnum('league_status', values(LeagueStatus));
export const dayStatus = pgEnum('day_status', values(DayStatus));
export const matchStatus = pgEnum('match_status', values(MatchStatus));
export const resultStatus = pgEnum('result_status', values(ResultStatus));
export const entryStatus = pgEnum('entry_status', values(EntryStatus));
export const claimStatus = pgEnum('claim_status', values(ClaimStatus));
export const contributionSource = pgEnum('contribution_source', values(ContributionSource));
export const contributionStatus = pgEnum('contribution_status', values(ContributionStatus));
export const obligationKind = pgEnum('obligation_kind', values(ObligationKind));
export const obligationStatus = pgEnum('obligation_status', values(ObligationStatus));
export const payoutAttemptStatus = pgEnum('payout_attempt_status', values(PayoutAttemptStatus));
export const jackpotStatus = pgEnum('jackpot_status', values(JackpotStatus));
export const mediaKind = pgEnum('media_kind', values(MediaKind));
export const mediaStatus = pgEnum('media_status', values(MediaStatus));
export const mediaBucket = pgEnum('media_bucket', ['public', 'private']);
export const emailPurpose = pgEnum('email_purpose', values(EmailPurpose));
export const emailStatus = pgEnum('email_status', values(EmailStatus));
