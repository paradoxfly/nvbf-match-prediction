import { adminAuthContract } from './routers/admin';
import { authContract } from './routers/auth';
import {
  adminContributionsContract,
  adminPaymentsContract,
  entriesContract,
} from './routers/entries';
import { adminMediaContract } from './routers/media';
import { adminJackpotContract, adminPayoutsContract, payoutsContract } from './routers/payouts';
import { jackpotContract, predictionsContract } from './routers/predictions';
import { adminResultsContract, leaderboardContract } from './routers/results';
import { adminAuditContract, adminPlayersContract, adminReportsContract } from './routers/staff';
import { publicContract } from './routers/public';
import {
  adminDaysContract,
  adminLeaguesContract,
  adminSettingsContract,
  adminTeamsContract,
} from './routers/setup';
import { adminStandingsContract } from './routers/standings';
import { systemContract } from './routers/system';

export * from './banks';
export * from './common';
export * from './config';
export * from './enums';
export * from './views';
export * from './routers/admin';
export * from './routers/auth';
export * from './routers/entries';
export * from './routers/media';
export * from './routers/payouts';
export * from './routers/predictions';
export * from './routers/results';
export * from './routers/public';
export * from './routers/setup';
export * from './routers/staff';
export * from './routers/standings';
export * from './routers/system';

/** The full API surface. Every HTTP route the API serves is declared here. */
export const contract = {
  system: systemContract,
  auth: authContract,
  public: publicContract,
  entries: entriesContract,
  predictions: predictionsContract,
  jackpot: jackpotContract,
  leaderboard: leaderboardContract,
  payouts: payoutsContract,
  admin: {
    results: adminResultsContract,
    payouts: adminPayoutsContract,
    jackpot: adminJackpotContract,
    players: adminPlayersContract,
    audit: adminAuditContract,
    reports: adminReportsContract,
    payments: adminPaymentsContract,
    contributions: adminContributionsContract,
    auth: adminAuthContract,
    media: adminMediaContract,
    teams: adminTeamsContract,
    leagues: adminLeaguesContract,
    days: adminDaysContract,
    standings: adminStandingsContract,
    settings: adminSettingsContract,
  },
};

export type Contract = typeof contract;
