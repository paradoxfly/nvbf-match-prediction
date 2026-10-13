import { Injectable } from '@nestjs/common';
import { ledgerEntries, sql, type Executor } from '@predict/db';
import type { Actor } from '../common/audit.service';

/**
 * Money accounts in the journal. Amounts are signed kobo; each account's sum is its balance.
 * - collections: entry fees confirmed (minus revocations)
 * - contributions: sponsor / operator / rollover money committed to pools
 * - prizes_awarded / jackpot_awarded: prize obligations created at finalization / settlement
 * - jackpot_cut: entry-fee money moved into the league jackpot
 * - operations: the organiser's share (including rounding)
 * - refunds_owed: refund obligations created
 * - payouts_paid / refunds_paid: money actually sent out
 */
export type LedgerAccount =
  | 'collections'
  | 'contributions'
  | 'prizes_awarded'
  | 'jackpot_awarded'
  | 'jackpot_cut'
  | 'operations'
  | 'refunds_owed'
  | 'payouts_paid'
  | 'refunds_paid';

export interface LedgerEvent {
  /** Unique per business event, e.g. `entry_confirmed:<entryId>:1`. Replays are rejected. */
  eventKey: string;
  legs: Array<{ account: LedgerAccount; amountKobo: number }>;
  dayId?: string | null;
  jackpotId?: string | null;
  refType: string;
  refId: string;
  memo?: string;
}

/** Append-only money journal (a database trigger forbids edits and deletes). */
@Injectable()
export class LedgerService {
  /** Writes an event inside the caller's transaction. Zero legs are skipped. */
  async post(executor: Executor, actor: Actor, event: LedgerEvent) {
    const legs = event.legs.filter((leg) => leg.amountKobo !== 0);
    if (legs.length === 0) return;
    for (const leg of legs) {
      if (!Number.isSafeInteger(leg.amountKobo))
        throw new Error(`Unsafe ledger amount ${leg.amountKobo}`);
    }
    await executor.insert(ledgerEntries).values(
      legs.map((leg) => ({
        eventKey: event.eventKey,
        account: leg.account,
        amountKobo: leg.amountKobo,
        matchDayId: event.dayId ?? null,
        jackpotId: event.jackpotId ?? null,
        refType: event.refType,
        refId: event.refId,
        memo: event.memo ?? null,
        actorType: actor.type,
        actorId: actor.type === 'system' ? null : actor.id,
      })),
    );
  }

  /** How many events with this key prefix exist (for numbering repeat events, e.g. re-confirms). */
  async countEvents(executor: Executor, prefix: string): Promise<number> {
    const result = await executor.execute<{ n: number }>(sql`
      select count(distinct ${ledgerEntries.eventKey})::int as n
      from ${ledgerEntries}
      where ${ledgerEntries.eventKey} like ${`${prefix}%`}
    `);
    return result.rows[0]?.n ?? 0;
  }
}
