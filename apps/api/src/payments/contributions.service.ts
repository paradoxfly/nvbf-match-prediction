import { Inject, Injectable } from '@nestjs/common';
import type { ContributionView, CreateContributionInput } from '@predict/contracts';
import {
  and,
  desc,
  eq,
  jackpots,
  matchDays,
  mediaAssets,
  prizeContributions,
  type Database,
  type Executor,
} from '@predict/db';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';
import { LedgerService } from '../ledger/ledger.service';
import { MediaService } from '../media/media.service';

type ContributionRow = typeof prizeContributions.$inferSelect;

/**
 * Extra prize money: sponsors and operator top-ups, for one day or the jackpot. A pledge never
 * counts toward the guaranteed pool; only allocated (received and committed) money does.
 */
@Injectable()
export class ContributionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly cache: TtlCache,
  ) {}

  async list(filter: { dayId?: string; jackpotId?: string }): Promise<ContributionView[]> {
    const rows = await this.db
      .select({
        row: prizeContributions,
        date: matchDays.date,
        logoKey: mediaAssets.storageKey,
        logoStatus: mediaAssets.status,
      })
      .from(prizeContributions)
      .leftJoin(matchDays, eq(matchDays.id, prizeContributions.matchDayId))
      .leftJoin(mediaAssets, eq(mediaAssets.id, prizeContributions.sponsorLogoMediaId))
      .where(
        and(
          filter.dayId ? eq(prizeContributions.matchDayId, filter.dayId) : undefined,
          filter.jackpotId ? eq(prizeContributions.jackpotId, filter.jackpotId) : undefined,
        ),
      )
      .orderBy(desc(prizeContributions.createdAt));
    return rows.map(({ row, date, logoKey, logoStatus }) =>
      this.view(row, date, this.media.urlFromKey(logoKey, logoStatus)),
    );
  }

  async create(actor: Actor, input: CreateContributionInput): Promise<ContributionView> {
    const id = await this.db.transaction(async (tx) => {
      await this.lockTarget(tx, { dayId: input.dayId ?? null, jackpotId: input.jackpotId ?? null });
      if (input.sponsorLogoMediaId) {
        await this.media.requireReady(tx, input.sponsorLogoMediaId, ['sponsor_logo']);
      }
      const now = new Date();
      const [row] = await tx
        .insert(prizeContributions)
        .values({
          source: input.source,
          status: input.received ? 'allocated' : 'pledged',
          matchDayId: input.dayId ?? null,
          jackpotId: input.jackpotId ?? null,
          amountKobo: input.amountKobo,
          sponsorName: input.sponsorName ?? null,
          sponsorLogoMediaId: input.sponsorLogoMediaId ?? null,
          sponsorUrl: input.sponsorUrl ?? null,
          note: input.note ?? null,
          receivedAt: input.received ? now : null,
          allocatedAt: input.received ? now : null,
          createdByAdminId: actor.type === 'admin' ? actor.id : null,
        })
        .returning();
      if (input.received) await this.postAllocated(tx, actor, row!);
      await this.audit.record(tx, actor, {
        action: input.received ? 'contribution.allocated' : 'contribution.pledged',
        targetType: 'prize_contribution',
        targetId: row!.id,
        after: { source: row!.source, amountKobo: row!.amountKobo, sponsorName: row!.sponsorName },
      });
      return row!.id;
    });
    this.cache.invalidate('public:');
    return this.get(id);
  }

  async allocate(actor: Actor, id: string): Promise<ContributionView> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, id, { allowClosedTargetForPledge: false });
      if (row.status === 'allocated') return;
      if (row.status !== 'pledged') throw new DomainError('BAD_STATUS');
      const now = new Date();
      const [updated] = await tx
        .update(prizeContributions)
        .set({ status: 'allocated', receivedAt: row.receivedAt ?? now, allocatedAt: now })
        .where(and(eq(prizeContributions.id, id), eq(prizeContributions.status, 'pledged')))
        .returning();
      await this.postAllocated(tx, actor, updated!);
      await this.audit.record(tx, actor, {
        action: 'contribution.allocated',
        targetType: 'prize_contribution',
        targetId: id,
      });
    });
    this.cache.invalidate('public:');
    return this.get(id);
  }

  /**
   * Withdraws a pledge, or returns allocated money before it has been promised to players: a day
   * that hasn't opened (or was cancelled), or a jackpot that hasn't closed.
   */
  async returnContribution(actor: Actor, id: string, reason: string): Promise<ContributionView> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, id, { allowClosedTargetForPledge: true });
      if (row.status === 'returned') return;
      if (row.status === 'allocated') {
        if (row.matchDayId) {
          const [day] = await tx.select().from(matchDays).where(eq(matchDays.id, row.matchDayId));
          if (day && day.openedAt && day.status !== 'cancelled')
            throw new DomainError('TARGET_CLOSED');
        }
        if (row.jackpotId) {
          const [jackpot] = await tx.select().from(jackpots).where(eq(jackpots.id, row.jackpotId));
          if (jackpot && jackpot.status !== 'open') throw new DomainError('TARGET_CLOSED');
        }
        await this.ledger.post(tx, actor, {
          eventKey: `contribution_returned:${row.id}`,
          legs: [{ account: 'contributions', amountKobo: -row.amountKobo }],
          dayId: row.matchDayId,
          jackpotId: row.jackpotId,
          refType: 'prize_contribution',
          refId: row.id,
          memo: reason,
        });
      }
      await tx
        .update(prizeContributions)
        .set({ status: 'returned', returnedAt: new Date() })
        .where(eq(prizeContributions.id, id));
      await this.audit.record(tx, actor, {
        action: 'contribution.returned',
        targetType: 'prize_contribution',
        targetId: id,
        reason,
      });
    });
    this.cache.invalidate('public:');
    return this.get(id);
  }

  private async postAllocated(tx: Executor, actor: Actor, row: ContributionRow) {
    await this.ledger.post(tx, actor, {
      eventKey: `contribution_allocated:${row.id}`,
      legs: [{ account: 'contributions', amountKobo: row.amountKobo }],
      dayId: row.matchDayId,
      jackpotId: row.jackpotId,
      refType: 'prize_contribution',
      refId: row.id,
    });
  }

  /** Money can only be added while its pool is still open to change. */
  private async lockTarget(
    tx: Executor,
    target: { dayId: string | null; jackpotId: string | null },
  ) {
    if (target.dayId) {
      const [day] = await tx
        .select()
        .from(matchDays)
        .where(eq(matchDays.id, target.dayId))
        .for('update');
      if (!day) throw new DomainError('NOT_FOUND');
      if (['finalized', 'completed', 'cancelled'].includes(day.status)) {
        throw new DomainError('TARGET_CLOSED');
      }
    }
    if (target.jackpotId) {
      const [jackpot] = await tx
        .select()
        .from(jackpots)
        .where(eq(jackpots.id, target.jackpotId))
        .for('update');
      if (!jackpot) throw new DomainError('NOT_FOUND');
      if (jackpot.status === 'settled' || jackpot.status === 'carried_over') {
        throw new DomainError('TARGET_CLOSED');
      }
    }
  }

  /**
   * Locks the pool (day or jackpot) first, then the contribution: the same order as every other
   * money change. A pledge can still be withdrawn after its pool closed (it never counted).
   */
  private async lockRow(
    tx: Executor,
    id: string,
    options: { allowClosedTargetForPledge: boolean },
  ): Promise<ContributionRow> {
    const [peek] = await tx.select().from(prizeContributions).where(eq(prizeContributions.id, id));
    if (!peek) throw new DomainError('NOT_FOUND');
    await this.lockTarget(tx, { dayId: peek.matchDayId, jackpotId: peek.jackpotId }).catch(
      (error) => {
        const tolerated =
          options.allowClosedTargetForPledge &&
          peek.status === 'pledged' &&
          error instanceof DomainError &&
          error.code === 'TARGET_CLOSED';
        if (!tolerated) throw error;
      },
    );
    const [row] = await tx
      .select()
      .from(prizeContributions)
      .where(eq(prizeContributions.id, id))
      .for('update');
    return row!;
  }

  private async get(id: string): Promise<ContributionView> {
    const [item] = (await this.list({})).filter((view) => view.id === id);
    if (!item) throw new DomainError('NOT_FOUND');
    return item;
  }

  private view(
    row: ContributionRow,
    date: string | null,
    logoUrl: string | null,
  ): ContributionView {
    return {
      id: row.id,
      source: row.source,
      status: row.status,
      dayId: row.matchDayId,
      dayDate: date,
      jackpotId: row.jackpotId,
      amountKobo: row.amountKobo,
      sponsorName: row.sponsorName,
      sponsorLogoUrl: logoUrl,
      sponsorUrl: row.sponsorUrl,
      note: row.note,
      receivedAt: row.receivedAt,
      allocatedAt: row.allocatedAt,
      returnedAt: row.returnedAt,
      createdAt: row.createdAt,
    };
  }
}
