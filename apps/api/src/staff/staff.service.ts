import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminPlayer,
  AdminPlayerDetail,
  AuditEntryView,
  DayReconciliation,
  LedgerTotals,
  ReconciliationReport,
  UserStatus,
} from '@predict/contracts';
import {
  adminUsers,
  and,
  asc,
  auditLogs,
  bankPayments,
  count,
  desc,
  eq,
  entries,
  ilike,
  inArray,
  isNull,
  ledgerEntries,
  matchDays,
  or,
  payoutAccounts,
  payoutObligations,
  sql,
  users,
  type Database,
} from '@predict/db';
import { normalizeNigerianPhone } from '@predict/domain';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { DB } from '../database/database.module';
import { SessionService } from '../auth/session.service';

const ACCOUNTS: Record<keyof LedgerTotals, string> = {
  collections: 'collections',
  contributions: 'contributions',
  prizesAwarded: 'prizes_awarded',
  jackpotCut: 'jackpot_cut',
  jackpotAwarded: 'jackpot_awarded',
  operations: 'operations',
  refundsOwed: 'refunds_owed',
  payoutsPaid: 'payouts_paid',
  refundsPaid: 'refunds_paid',
};

const emptyTotals = (): LedgerTotals => ({
  collections: 0,
  contributions: 0,
  prizesAwarded: 0,
  jackpotCut: 0,
  jackpotAwarded: 0,
  operations: 0,
  refundsOwed: 0,
  payoutsPaid: 0,
  refundsPaid: 0,
});

/** Staff tools: players, the audit log and money reconciliation. */
@Injectable()
export class StaffService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  async players(query: {
    page: number;
    pageSize: number;
    q?: string;
    status?: UserStatus;
    sharedAccountsOnly?: boolean;
  }) {
    const search = query.q?.trim();
    const phone = search ? normalizeNigerianPhone(search) : null;
    const shared = sql`exists (
      select 1 from ${payoutAccounts} a
      join ${payoutAccounts} b on b.fingerprint = a.fingerprint and b.user_id <> a.user_id and b.cancelled_at is null
      where a.user_id = ${users.id} and a.cancelled_at is null
    )`;
    const where = and(
      search
        ? or(
            ilike(users.displayName, `%${search}%`),
            ilike(users.email, `%${search}%`),
            phone ? eq(users.phone, phone) : ilike(users.phone, `%${search.replace(/^0/, '')}%`),
          )
        : undefined,
      query.status ? eq(users.status, query.status) : undefined,
      query.sharedAccountsOnly ? shared : undefined,
    );
    const [total] = await this.db.select({ n: count() }).from(users).where(where);
    const rows = await this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: await this.playerViews(rows),
      page: query.page,
      pageSize: query.pageSize,
      total: total?.n ?? 0,
    };
  }

  async player(id: string): Promise<AdminPlayerDetail> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    if (!row) throw new DomainError('NOT_FOUND');
    const [view] = await this.playerViews([row]);
    const history = await this.db
      .select({ entry: entries, date: matchDays.date })
      .from(entries)
      .innerJoin(matchDays, eq(matchDays.id, entries.matchDayId))
      .where(eq(entries.userId, id))
      .orderBy(desc(matchDays.date));
    return {
      ...view!,
      entryHistory: history.map(({ entry, date }) => ({
        entryId: entry.id,
        date,
        status: entry.status,
        paymentReference: entry.paymentReference,
        disqualified: entry.disqualifiedAt !== null,
      })),
    };
  }

  /** Suspending signs the player out everywhere; their history and money owed stay intact. */
  async setPlayerStatus(actor: Actor, id: string, status: UserStatus, reason: string) {
    await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, id)).for('update');
      if (!before) throw new DomainError('NOT_FOUND');
      await tx
        .update(users)
        .set({ status, statusReason: status === 'active' ? null : reason })
        .where(eq(users.id, id));
      await this.audit.record(tx, actor, {
        action: status === 'active' ? 'player.reinstated' : 'player.suspended',
        targetType: 'user',
        targetId: id,
        reason,
        before: { status: before.status },
        after: { status },
      });
    });
    if (status !== 'active') await this.sessions.revokeAll('user', id);
    return this.player(id);
  }

  async auditLog(query: {
    page: number;
    pageSize: number;
    targetType?: string;
    targetId?: string;
    action?: string;
  }) {
    const where = and(
      query.targetType ? eq(auditLogs.targetType, query.targetType) : undefined,
      query.targetId ? eq(auditLogs.targetId, query.targetId) : undefined,
      query.action ? ilike(auditLogs.action, `${query.action}%`) : undefined,
    );
    const [total] = await this.db.select({ n: count() }).from(auditLogs).where(where);
    const rows = await this.db
      .select({
        log: auditLogs,
        adminName: adminUsers.name,
        userName: users.displayName,
      })
      .from(auditLogs)
      .leftJoin(
        adminUsers,
        and(eq(auditLogs.actorType, 'admin'), eq(adminUsers.id, auditLogs.actorId)),
      )
      .leftJoin(users, and(eq(auditLogs.actorType, 'user'), eq(users.id, auditLogs.actorId)))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const items: AuditEntryView[] = rows.map(({ log, adminName, userName }) => ({
      id: log.id,
      createdAt: log.createdAt,
      actorType: log.actorType,
      actorName: log.actorType === 'system' ? 'System' : (adminName ?? userName ?? null),
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      reason: log.reason,
      before: log.before ?? null,
      after: log.after ?? null,
      metadata: log.metadata ?? null,
    }));
    return { items, page: query.page, pageSize: query.pageSize, total: total?.n ?? 0 };
  }

  /**
   * Every day's money from the append-only journal, checked against the rule that what came in
   * equals what was allocated: collections + contributions = prizes + jackpot cut + operations.
   */
  async reconciliation(leagueId?: string): Promise<ReconciliationReport> {
    const days = await this.db
      .select()
      .from(matchDays)
      .where(leagueId ? eq(matchDays.leagueId, leagueId) : undefined)
      .orderBy(asc(matchDays.date));
    const rows = await this.db
      .select({
        dayId: ledgerEntries.matchDayId,
        account: ledgerEntries.account,
        total: sql<string>`sum(${ledgerEntries.amountKobo})`,
      })
      .from(ledgerEntries)
      .groupBy(ledgerEntries.matchDayId, ledgerEntries.account);
    const outstanding = await this.db
      .select({
        dayId: payoutObligations.matchDayId,
        total: sql<string>`sum(${payoutObligations.amountKobo})`,
      })
      .from(payoutObligations)
      .where(
        and(isNull(payoutObligations.supersededAt), sql`${payoutObligations.status} <> 'paid'`),
      )
      .groupBy(payoutObligations.matchDayId);

    const byDay = new Map<string | null, LedgerTotals>();
    const overall = emptyTotals();
    for (const row of rows) {
      const totals = byDay.get(row.dayId) ?? emptyTotals();
      const key = (Object.keys(ACCOUNTS) as Array<keyof LedgerTotals>).find(
        (k) => ACCOUNTS[k] === row.account,
      );
      if (!key) continue;
      totals[key] += Number(row.total);
      overall[key] += Number(row.total);
      byDay.set(row.dayId, totals);
    }

    const dayViews: DayReconciliation[] = days.map((day) => {
      const totals = byDay.get(day.id) ?? emptyTotals();
      const final = day.status === 'finalized' || day.status === 'completed';
      return {
        dayId: day.id,
        date: day.date,
        status: day.status,
        totals,
        outstandingKobo: Number(outstanding.find((o) => o.dayId === day.id)?.total ?? 0),
        balanced: final
          ? totals.collections + totals.contributions ===
            totals.prizesAwarded + totals.jackpotCut + totals.operations
          : day.status === 'cancelled'
            ? totals.collections === totals.refundsOwed && totals.contributions === 0
            : null,
      };
    });

    const [received] = await this.db
      .select({ total: sql<string | null>`sum(${bankPayments.amountKobo})` })
      .from(bankPayments)
      .where(isNull(bankPayments.voidedAt));
    const [applied] = await this.db
      .select({ total: sql<string | null>`sum(${entries.feeKobo})` })
      .from(entries)
      .where(
        and(
          sql`${entries.bankPaymentId} is not null`,
          inArray(entries.status, ['confirmed', 'refunded']),
        ),
      );
    const [refunded] = await this.db
      .select({ total: sql<string | null>`sum(${payoutObligations.amountKobo})` })
      .from(payoutObligations)
      .where(
        and(
          sql`${payoutObligations.bankPaymentId} is not null`,
          isNull(payoutObligations.supersededAt),
        ),
      );
    const receivedKobo = Number(received?.total ?? 0);
    const appliedKobo = Number(applied?.total ?? 0);
    const refundedKobo = Number(refunded?.total ?? 0);

    return {
      days: dayViews,
      totals: overall,
      transfers: {
        receivedKobo,
        appliedKobo,
        refundedKobo,
        unappliedKobo: Math.max(0, receivedKobo - appliedKobo - refundedKobo),
      },
      generatedAt: new Date(),
    };
  }

  private async playerViews(rows: Array<typeof users.$inferSelect>): Promise<AdminPlayer[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const counts = await this.db
      .select({
        userId: entries.userId,
        total: count(),
        confirmed: sql<number>`count(*) filter (where ${entries.status} = 'confirmed')::int`,
      })
      .from(entries)
      .where(inArray(entries.userId, ids))
      .groupBy(entries.userId);
    const shared = await this.db.execute<{
      user_id: string;
      other_id: string;
      other_name: string;
    }>(sql`
      select distinct a.user_id, b.user_id as other_id, u.display_name as other_name
      from ${payoutAccounts} a
      join ${payoutAccounts} b on b.fingerprint = a.fingerprint and b.user_id <> a.user_id and b.cancelled_at is null
      join ${users} u on u.id = b.user_id
      where a.cancelled_at is null and a.user_id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);
    return rows.map((row) => {
      const c = counts.find((x) => x.userId === row.id);
      return {
        id: row.id,
        displayName: row.displayName,
        email: row.email,
        phone: row.phone,
        status: row.status,
        statusReason: row.statusReason,
        createdAt: row.createdAt,
        lastLoginAt: row.lastLoginAt,
        entries: c?.total ?? 0,
        confirmedEntries: Number(c?.confirmed ?? 0),
        sharedAccountWith: shared.rows
          .filter((s) => s.user_id === row.id)
          .map((s) => ({ id: s.other_id, displayName: s.other_name })),
      };
    });
  }
}
