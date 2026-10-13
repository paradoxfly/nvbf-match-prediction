import type { ApiClient } from '@predict/api-client';

// What the browser actually receives: the JSON form of each contract (dates are ISO strings).

export type HomeData = Awaited<ReturnType<ApiClient['public']['home']>>;
export type DayData = NonNullable<HomeData['featured']>;
export type DayCardData = HomeData['days'][number];
export type MatchData = DayData['matches'][number];
export type TeamData = MatchData['home'];
export type PoolData = DayData['pool'];
export type PublicJackpotData = NonNullable<HomeData['jackpot']>;

export type MyDayData = Awaited<ReturnType<ApiClient['entries']['myDay']>>;
export type EntryData = NonNullable<MyDayData['entry']>;
export type PredictionData = MyDayData['predictions'][number];
export type CollectionAccountData = NonNullable<MyDayData['collectionAccount']>;
export type SavePicksResult = Awaited<ReturnType<ApiClient['predictions']['save']>>;
export type MyEntryData = Awaited<ReturnType<ApiClient['entries']['myEntries']>>['items'][number];

export type LeaderboardData = Awaited<ReturnType<ApiClient['leaderboard']['day']>>;
export type LeaderboardRowData = LeaderboardData['rows'][number];
export type MyStandingData = Awaited<ReturnType<ApiClient['leaderboard']['mine']>>;

export type JackpotData = Awaited<ReturnType<ApiClient['jackpot']['view']>>;
export type MyJackpotData = Awaited<ReturnType<ApiClient['jackpot']['mine']>>;

export type StandingsData = Awaited<ReturnType<ApiClient['public']['standings']>>;
export type RulesData = Awaited<ReturnType<ApiClient['public']['rules']>>;

export type ObligationData = Awaited<
  ReturnType<ApiClient['payouts']['myObligations']>
>['items'][number];
export type PayoutAccountData = Awaited<ReturnType<ApiClient['payouts']['myAccount']>>;
