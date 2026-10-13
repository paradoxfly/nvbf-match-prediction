import type { ApiClient } from '@predict/api-client';

// What the browser actually receives: the contract outputs after JSON (dates are ISO strings).

type Output<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;

type Admin = ApiClient['admin'];

export type AdminDay = Output<Admin['days']['get']>;
export type DayListItem = Output<Admin['days']['list']>['items'][number];
export type DayMatch = AdminDay['matches'][number];
export type TeamRef = DayMatch['home'];
export type Pool = AdminDay['pool'];

export type Team = Output<Admin['teams']['list']>['items'][number];

export type League = Output<Admin['leagues']['get']>;
export type LeagueListItem = Output<Admin['leagues']['list']>['items'][number];
export type LeagueTeam = League['teams'][number];
export type LeagueDayCard = League['days'][number];
export type FixtureImport = Output<Admin['leagues']['importFixtures']>;

export type Standings = Output<Admin['standings']['get']>;
export type StandingsInputRow = Output<Admin['standings']['fromResults']>['rows'][number];

export type Jackpot = Output<Admin['jackpot']['get']>;

export type ResultVersion = Output<Admin['results']['versions']>['items'][number];
export type Leaderboard = Output<Admin['results']['leaderboard']>;
export type LeaderboardRow = Leaderboard['rows'][number];

export type PaymentItem = Output<Admin['payments']['queue']>['items'][number];
export type Claim = NonNullable<PaymentItem['latestClaim']>;
export type BankPayment = Output<Admin['payments']['transfers']>['items'][number];

export type Obligation = Output<Admin['payouts']['list']>['items'][number];
export type PayoutAttempt = Obligation['attempts'][number];

export type Contribution = Output<Admin['contributions']['list']>['items'][number];

export type Settings = Output<Admin['settings']['get']>;

export type Player = Output<Admin['players']['list']>['items'][number];
export type PlayerDetail = Output<Admin['players']['get']>;
export type AuditEntry = Output<Admin['audit']['list']>['items'][number];
export type Reconciliation = Output<Admin['reports']['reconciliation']>;
