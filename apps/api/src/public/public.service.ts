import { Inject, Injectable } from '@nestjs/common';
import { product } from '@predict/brand';
import type {
  DayPublic,
  HomeView,
  PublicJackpot,
  RulesDocumentView,
  StandingsView,
} from '@predict/contracts';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  jackpotEntries,
  jackpots,
  leagues,
  leagueTeams,
  matchDays,
  matches,
  prizeContributions,
  sum,
  type Database,
} from '@predict/db';
import {
  buildRules,
  computePool,
  entryCutoff,
  rulesHash,
  watDate,
  type RulesDocument,
} from '@predict/domain';
import { DomainError } from '../common/domain-error';
import {
  ContestReadService,
  dayRulesSummary,
  dayTiming,
  matchTiming,
  type DayRow,
} from '../contest/contest-read.service';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';
import { SettingsService } from '../setup/settings.service';

/** Days the public can see. Drafts stay hidden until staff publish them. */
const VISIBLE = ['published', 'open', 'closed', 'finalized', 'completed', 'cancelled'] as const;
const CACHE_MS = 5_000;

@Injectable()
export class PublicService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly read: ContestReadService,
    private readonly settings: SettingsService,
    private readonly cache: TtlCache,
  ) {}

  /** The league shown on the site: the running one, else the most recent. */
  async currentLeague() {
    const [active] = await this.db
      .select()
      .from(leagues)
      .where(eq(leagues.status, 'active'))
      .orderBy(desc(leagues.startDate))
      .limit(1);
    if (active) return active;
    const [latest] = await this.db
      .select()
      .from(leagues)
      .where(inArray(leagues.status, ['completed']))
      .orderBy(desc(leagues.startDate))
      .limit(1);
    return latest ?? null;
  }

  /** The home page; `serverNow` is set per request (outside the cache) for exact countdowns. */
  async home(): Promise<HomeView> {
    const view = await this.cache.get('public:home', CACHE_MS, async () => {
      const league = await this.currentLeague();
      if (!league) {
        return {
          serverNow: new Date(),
          leagueName: null,
          featured: null,
          days: [],
          jackpot: null,
          standingsPublic: false,
        };
      }
      const days = await this.visibleDays(league.id);
      const today = watDate(new Date());
      const featured =
        days.find((day) => day.date === today) ??
        days.find((day) => day.date > today && day.status !== 'cancelled') ??
        [...days].reverse().find((day) => day.date < today) ??
        null;
      return {
        serverNow: new Date(),
        leagueName: league.name,
        featured: featured ? await this.dayPublic(featured, league.name) : null,
        days: await this.read.dayCards(days),
        jackpot: await this.jackpot(league.id, league.name),
        standingsPublic: league.standingsPublic,
      };
    });
    return { ...view, serverNow: new Date() };
  }

  async day(date: string): Promise<DayPublic & { serverNow: Date }> {
    const view = await this.cache.get(`public:day:${date}`, CACHE_MS, async () => {
      const league = await this.currentLeague();
      if (!league) throw new DomainError('NOT_FOUND');
      const [day] = await this.db
        .select()
        .from(matchDays)
        .where(
          and(
            eq(matchDays.leagueId, league.id),
            eq(matchDays.date, date),
            inArray(matchDays.status, [...VISIBLE]),
          ),
        );
      if (!day) throw new DomainError('NOT_FOUND');
      return this.dayPublic(day, league.name);
    });
    return { ...view, serverNow: new Date() };
  }

  /** A day's frozen rules once it opened; otherwise rules built from its (or the league's) settings. */
  async rules(date?: string): Promise<RulesDocumentView> {
    const league = await this.currentLeague();
    let day: DayRow | undefined;
    if (league && date) {
      [day] = await this.db
        .select()
        .from(matchDays)
        .where(and(eq(matchDays.leagueId, league.id), eq(matchDays.date, date)));
    }
    if (day?.rulesSnapshot && day.rulesHash) {
      return { ...(day.rulesSnapshot as RulesDocument), date: day.date, hash: day.rulesHash };
    }
    const config = day ?? league?.defaults ?? (await this.settings.row()).defaultDayConfig;
    const [jackpot] = league
      ? await this.db.select().from(jackpots).where(eq(jackpots.leagueId, league.id))
      : [];
    const settings = await this.settings.row();
    const document = buildRules({
      productName: product.name,
      entryFeeKobo: config.entryFeeKobo,
      prizeBps: config.prizeBps,
      jackpotBps: config.jackpotBps,
      prizeTiersBps: config.prizeTiersBps,
      scoring: config.scoring,
      format: config.format,
      tieBreakers: config.tieBreakers,
      lockLeadMin: config.lockLeadMin,
      minScoredMatches: config.minScoredMatches ?? 5,
      jackpotEntryClosesAt: jackpot?.entryClosesAt ?? null,
      claimHelp: settings.supportContact ?? undefined,
    });
    return { ...document, date: day?.date ?? null, hash: rulesHash(document) };
  }

  standings(): Promise<StandingsView> {
    return this.cache.get('public:standings', CACHE_MS, async () => {
      const league = await this.currentLeague();
      if (!league || !league.standingsPublic) throw new DomainError('NOT_PUBLISHED');
      const rows = await this.db
        .select()
        .from(leagueTeams)
        .where(eq(leagueTeams.leagueId, league.id))
        .orderBy(asc(leagueTeams.position));
      const refs = await this.read.teamRefs(rows.map((row) => row.teamId));
      const tables = (['men', 'women'] as const)
        .map((category) => ({
          category,
          rows: rows
            .filter((row) => row.category === category && !row.withdrawnAt)
            .sort(
              (a, b) =>
                (a.position ?? 999) - (b.position ?? 999) ||
                b.points - a.points ||
                refs.get(a.teamId)!.name.localeCompare(refs.get(b.teamId)!.name),
            )
            .map((row, index) => ({
              position: index + 1,
              team: refs.get(row.teamId)!,
              played: row.played,
              lost: row.lost,
              setsWon: row.setsWon,
              setsLost: row.setsLost,
              points: row.points,
            })),
        }))
        .filter((table) => table.rows.length > 0);
      return {
        leagueName: league.name,
        updatedAt: league.standingsUpdatedAt,
        final: league.standingsFinalizedAt !== null,
        tables,
      };
    });
  }

  async jackpot(leagueId: string, leagueName: string): Promise<PublicJackpot | null> {
    const [jackpot] = await this.db.select().from(jackpots).where(eq(jackpots.leagueId, leagueId));
    if (!jackpot) return null;
    const [[entered], [cuts], [extra], running] = await Promise.all([
      this.db
        .select({ n: count() })
        .from(jackpotEntries)
        .where(eq(jackpotEntries.jackpotId, jackpot.id)),
      this.db
        .select({ total: sum(matchDays.finalJackpotCutKobo) })
        .from(matchDays)
        .where(and(eq(matchDays.leagueId, leagueId), isNotNull(matchDays.finalizedAt))),
      this.db
        .select({ total: sum(prizeContributions.amountKobo) })
        .from(prizeContributions)
        .where(
          and(
            eq(prizeContributions.jackpotId, jackpot.id),
            eq(prizeContributions.status, 'allocated'),
          ),
        ),
      this.db
        .select()
        .from(matchDays)
        .where(
          and(eq(matchDays.leagueId, leagueId), inArray(matchDays.status, ['open', 'closed'])),
        ),
    ]);
    // Today's share is shown separately until those days are final.
    const counts = await this.read.confirmedCounts(running.map((day) => day.id));
    const pendingKobo = running.reduce(
      (total, day) =>
        total +
        computePool({
          confirmedCount: counts.get(day.id) ?? 0,
          entryFeeKobo: day.entryFeeKobo,
          prizeBps: day.prizeBps,
          jackpotBps: day.jackpotBps,
          contributionsKobo: 0,
        }).jackpotCutKobo,
      0,
    );
    return {
      leagueName,
      status: jackpot.status,
      entryClosesAt: jackpot.entryClosesAt,
      guaranteedKobo:
        jackpot.finalAmountKobo ?? Number(cuts?.total ?? 0) + Number(extra?.total ?? 0),
      pendingKobo: jackpot.finalAmountKobo !== null ? 0 : pendingKobo,
      entries: entered?.n ?? 0,
    };
  }

  private visibleDays(leagueId: string) {
    return this.db
      .select()
      .from(matchDays)
      .where(and(eq(matchDays.leagueId, leagueId), inArray(matchDays.status, [...VISIBLE])))
      .orderBy(asc(matchDays.date));
  }

  private async dayPublic(day: DayRow, leagueName: string): Promise<DayPublic> {
    const [views, pools, contributions, matchRows] = await Promise.all([
      this.read.matchViews([day]),
      this.read.pools([day]),
      this.read.dayContributions([day.id]),
      this.db.select().from(matches).where(eq(matches.matchDayId, day.id)),
    ]);
    const extra = contributions.get(day.id)!;
    const cutoff = ['open', 'published'].includes(day.status)
      ? entryCutoff(dayTiming(day), matchRows.map(matchTiming))
      : null;
    return {
      id: day.id,
      date: day.date,
      title: day.title,
      status: day.status,
      leagueName,
      opensAt: day.opensAt,
      submissionsCloseAt: day.submissionsCloseAt,
      closedAt: day.closedAt,
      entryCutoff: cutoff,
      settings: dayRulesSummary(day),
      matches: views.get(day.id) ?? [],
      pool: pools.get(day.id)!,
      sponsors: extra.sponsors,
      pledgedKobo: extra.pledgedKobo,
      updatedAt: new Date(),
    };
  }
}
