import { Inject, Injectable } from '@nestjs/common';
import type { SavePredictionsInput, SavePredictionsResult } from '@predict/contracts';
import {
  and,
  eq,
  entries,
  matchDays,
  matches,
  predictionRevisions,
  predictions,
  sql,
  type Database,
} from '@predict/db';
import { canSavePrediction, validateSetLine, type SetLine } from '@predict/domain';
import { DomainError } from '../common/domain-error';
import { enforceLimits, MINUTE } from '../common/limits';
import { RateLimitService } from '../common/rate-limit.service';
import { dayTiming, matchTiming } from '../contest/contest-read.service';
import { DB } from '../database/database.module';
import { EntriesService } from '../entries/entries.service';
import { PublicService } from '../public/public.service';

const sameSets = (a: SetLine, b: SetLine) =>
  a.length === b.length && a.every((set, i) => set.home === b[i]!.home && set.away === b[i]!.away);

/**
 * Saving picks. Takes no locks: each save is stamped with the database clock and every revision
 * is kept, so scoring can always pick the last version saved before each match locked. A save
 * that races a lock simply doesn't count.
 */
@Injectable()
export class PredictionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly entriesService: EntriesService,
    private readonly publicService: PublicService,
    private readonly limits: RateLimitService,
  ) {}

  async save(userId: string, input: SavePredictionsInput): Promise<SavePredictionsResult> {
    await enforceLimits(this.limits, [{ key: `picks:${userId}`, limit: 60, windowSec: MINUTE }]);
    const league = await this.publicService.currentLeague();
    if (!league) throw new DomainError('NOT_FOUND');
    const [day] = await this.db
      .select()
      .from(matchDays)
      .where(and(eq(matchDays.leagueId, league.id), eq(matchDays.date, input.date)));
    if (!day || day.status === 'draft') throw new DomainError('NOT_FOUND');
    if (day.status !== 'open') throw new DomainError('DAY_NOT_OPEN');

    let [entry] = await this.db
      .select()
      .from(entries)
      .where(and(eq(entries.matchDayId, day.id), eq(entries.userId, userId)));
    if (!entry) {
      const joined = await this.entriesService.join(userId, input.date);
      [entry] = await this.db.select().from(entries).where(eq(entries.id, joined.id));
    }
    if (!entry) throw new DomainError('NOT_FOUND');
    if (entry.disqualifiedAt) throw new DomainError('DISQUALIFIED');
    if (entry.status === 'expired' || entry.status === 'refunded')
      throw new DomainError('ENTRY_CLOSED');
    const entryId = entry.id;

    return this.db.transaction(async (tx) => {
      const clock = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
      const now = new Date(clock.rows[0]!.now);
      const dayMatches = await tx.select().from(matches).where(eq(matches.matchDayId, day.id));
      const byId = new Map(dayMatches.map((match) => [match.id, match]));
      const existing = new Map(
        (await tx.select().from(predictions).where(eq(predictions.entryId, entryId))).map((row) => [
          row.matchId,
          row,
        ]),
      );

      const result: SavePredictionsResult = { saved: [], rejected: [] };
      const seen = new Set<string>();
      for (const pick of input.predictions) {
        if (seen.has(pick.matchId)) continue;
        seen.add(pick.matchId);
        const match = byId.get(pick.matchId);
        if (!match) {
          result.rejected.push({
            matchId: pick.matchId,
            reason: 'UNKNOWN_MATCH',
            message: 'That match is not on this day.',
          });
          continue;
        }
        if (!canSavePrediction(matchTiming(match), dayTiming(day), now)) {
          result.rejected.push({
            matchId: pick.matchId,
            reason: 'LOCKED',
            message: 'This match has locked.',
          });
          continue;
        }
        const sets: SetLine = pick.sets.map((set) => ({ home: set.home, away: set.away }));
        const validation = validateSetLine(sets, day.format);
        if (!validation.ok) {
          result.rejected.push({
            matchId: pick.matchId,
            reason: 'INVALID',
            message: validation.issues.map((issue) => issue.message).join(' '),
          });
          continue;
        }
        const previous = existing.get(pick.matchId);
        if (previous && sameSets(previous.sets, sets)) {
          result.saved.push({ matchId: pick.matchId, savedAt: previous.savedAt, changed: false });
          continue;
        }
        const { homeSets, awaySets } = validation.summary.major;
        await tx
          .insert(predictions)
          .values({ entryId, matchId: pick.matchId, homeSets, awaySets, sets, savedAt: now })
          .onConflictDoUpdate({
            target: [predictions.entryId, predictions.matchId],
            set: { homeSets, awaySets, sets, savedAt: now },
          });
        await tx
          .insert(predictionRevisions)
          .values({ entryId, matchId: pick.matchId, homeSets, awaySets, sets, savedAt: now });
        result.saved.push({ matchId: pick.matchId, savedAt: now, changed: true });
      }
      return result;
    });
  }
}
