import { Inject, Injectable } from '@nestjs/common';
import { product } from '@predict/brand';
import {
  bankName as nameOfBank,
  type AdminObligation,
  type MyObligation,
  type MyPayoutAccount,
  type ObligationKind,
  type PayoutAccountView,
  type SavePayoutAccountInput,
} from '@predict/contracts';
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  jackpots,
  leagues,
  lte,
  matchDays,
  payoutAccounts,
  payoutAttempts,
  payoutObligations,
  sql,
  users,
  bankPayments,
  type Database,
  type Executor,
} from '@predict/db';
import { formatNaira, formatWatDateTime } from '@predict/domain';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { enforceLimits, HOUR } from '../common/limits';
import { RateLimitService } from '../common/rate-limit.service';
import { EncryptionService } from '../common/encryption.service';
import { isUniqueViolation } from '../common/pg-errors';
import { DB } from '../database/database.module';
import { LedgerService } from '../ledger/ledger.service';
import { PaymentsService } from '../payments/payments.service';
import { SmsService } from '../sms/sms.service';

type AccountRow = typeof payoutAccounts.$inferSelect;
type ObligationRow = typeof payoutObligations.$inferSelect;

/** A changed payout account only takes effect after this delay (SIM-swap protection). */
const ACCOUNT_CHANGE_DELAY_MS = 24 * 3600_000;

export interface NewObligation {
  kind: ObligationKind;
  userId: string | null;
  amountKobo: number;
  matchDayId?: string | null;
  entryId?: string | null;
  bankPaymentId?: string | null;
  jackpotId?: string | null;
  rank?: number | null;
  reason?: string | null;
}

/** What we owe (prizes, jackpot, refunds), where to pay it, and every payout attempt. */
@Injectable()
export class ObligationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly encryption: EncryptionService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly payments: PaymentsService,
    private readonly limits: RateLimitService,
  ) {}

  /** Records money owed. Ready to pay at once if the player already has bank details. */
  async create(executor: Executor, input: NewObligation): Promise<ObligationRow | null> {
    if (input.amountKobo <= 0) return null;
    const hasAccount = input.userId
      ? (await this.effectiveAccount(executor, input.userId)) !== null
      : true;
    const [row] = await executor
      .insert(payoutObligations)
      .values({
        kind: input.kind,
        status: hasAccount ? 'ready' : 'awaiting_details',
        userId: input.userId,
        matchDayId: input.matchDayId ?? null,
        entryId: input.entryId ?? null,
        bankPaymentId: input.bankPaymentId ?? null,
        jackpotId: input.jackpotId ?? null,
        rank: input.rank ?? null,
        amountKobo: input.amountKobo,
        reason: input.reason ?? null,
      })
      .returning();
    return row!;
  }

  // -------------------------------------------------------------------------------------------
  // Player: bank details and what they're owed

  async myAccount(userId: string): Promise<MyPayoutAccount> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(payoutAccounts)
      .where(and(eq(payoutAccounts.userId, userId), isNull(payoutAccounts.cancelledAt)))
      .orderBy(desc(payoutAccounts.activeFrom));
    const current = rows.find((row) => row.activeFrom <= now) ?? null;
    const pending = rows.find((row) => row.activeFrom > now) ?? null;
    return { current: current && accountView(current), pending: pending && accountView(pending) };
  }

  /**
   * Saves where winnings go. The first account counts straight away. A change waits 24 hours
   * (and we text the player), so a stolen phone can't quietly redirect their money.
   */
  async saveAccount(userId: string, input: SavePayoutAccountInput): Promise<MyPayoutAccount> {
    await enforceLimits(this.limits, [
      { key: `payout-account:${userId}`, limit: 5, windowSec: HOUR },
    ]);
    await this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!user) throw new DomainError('NOT_FOUND');
      const [busy] = await tx
        .select({ n: count() })
        .from(payoutObligations)
        .where(
          and(eq(payoutObligations.userId, userId), eq(payoutObligations.status, 'processing')),
        );
      if ((busy?.n ?? 0) > 0) throw new DomainError('CHANGE_BLOCKED');

      const fingerprint = this.encryption.fingerprint(`${input.bankCode}|${input.accountNumber}`);
      const current = await this.effectiveAccount(tx, userId);
      if (
        current &&
        current.fingerprint === fingerprint &&
        current.accountName === input.accountName
      ) {
        return;
      }
      const now = new Date();
      // A newer change replaces any change still waiting out its delay.
      await tx
        .update(payoutAccounts)
        .set({ cancelledAt: now })
        .where(
          and(
            eq(payoutAccounts.userId, userId),
            isNull(payoutAccounts.cancelledAt),
            gt(payoutAccounts.activeFrom, now),
          ),
        );
      const activeFrom = current ? new Date(now.getTime() + ACCOUNT_CHANGE_DELAY_MS) : now;
      await tx.insert(payoutAccounts).values({
        userId,
        bankCode: input.bankCode,
        bankName: nameOfBank(input.bankCode) ?? input.bankCode,
        accountNumberEnc: this.encryption.encrypt(input.accountNumber),
        encKeyId: this.encryption.currentKeyId,
        last4: input.accountNumber.slice(-4),
        fingerprint,
        accountName: input.accountName,
        activeFrom,
      });
      if (current) {
        await this.sms.queue(
          tx,
          user.phone,
          `${product.name}: your payout bank details were changed. The new account is used from ${formatWatDateTime(activeFrom)}. Not you? Contact ${product.supportEmail} now.`,
          'payout_account_changed',
          userId,
        );
      } else {
        await this.promoteReady(tx, userId);
      }
      await this.audit.record(
        tx,
        { type: 'user', id: userId },
        {
          action: current ? 'payout_account.change_requested' : 'payout_account.added',
          targetType: 'user',
          targetId: userId,
          metadata: { bankCode: input.bankCode, last4: input.accountNumber.slice(-4), activeFrom },
        },
      );
    });
    return this.myAccount(userId);
  }

  async cancelPendingAccount(userId: string): Promise<MyPayoutAccount> {
    await this.db
      .update(payoutAccounts)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(payoutAccounts.userId, userId),
          isNull(payoutAccounts.cancelledAt),
          gt(payoutAccounts.activeFrom, new Date()),
        ),
      );
    return this.myAccount(userId);
  }

  async myObligations(userId: string): Promise<MyObligation[]> {
    const rows = await this.db
      .select()
      .from(payoutObligations)
      .where(and(eq(payoutObligations.userId, userId), isNull(payoutObligations.supersededAt)))
      .orderBy(desc(payoutObligations.createdAt));
    const labels = await this.labels(rows);
    const paid = await this.paidAttempts(rows.map((row) => row.id));
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      amountKobo: row.amountKobo,
      label: labels.get(row.id) ?? '',
      rank: row.rank,
      statusNote: row.statusNote,
      paidAt: paid.get(row.id) ?? null,
      createdAt: row.createdAt,
    }));
  }

  /** Obligations waiting for bank details become payable once the player has an account. */
  async promoteReady(executor: Executor, userId?: string) {
    const now = new Date();
    await executor.execute(sql`
      update ${payoutObligations} o
      set status = 'ready', status_note = null, updated_at = now()
      where o.status in ('awaiting_details', 'details_invalid')
        and o.superseded_at is null
        and o.user_id is not null
        ${userId ? sql`and o.user_id = ${userId}` : sql``}
        and exists (
          select 1 from ${payoutAccounts} a
          where a.user_id = o.user_id and a.cancelled_at is null and a.active_from <= ${now}
            and (o.status = 'awaiting_details' or a.created_at > o.updated_at)
        )
    `);
  }

  // -------------------------------------------------------------------------------------------
  // Staff

  async list(query: {
    page: number;
    pageSize: number;
    status?: ObligationRow['status'];
    kind?: ObligationKind;
    dayId?: string;
  }) {
    const where = and(
      isNull(payoutObligations.supersededAt),
      query.status ? eq(payoutObligations.status, query.status) : undefined,
      query.kind ? eq(payoutObligations.kind, query.kind) : undefined,
      query.dayId ? eq(payoutObligations.matchDayId, query.dayId) : undefined,
    );
    const [total] = await this.db.select({ n: count() }).from(payoutObligations).where(where);
    const rows = await this.db
      .select()
      .from(payoutObligations)
      .where(where)
      .orderBy(desc(payoutObligations.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: await this.adminViews(rows),
      page: query.page,
      pageSize: query.pageSize,
      total: total?.n ?? 0,
    };
  }

  /** The full account number, for finance only. Every reveal is in the audit log. */
  async revealAccount(actor: Actor, id: string) {
    const obligation = await this.require(this.db, id);
    if (!obligation.userId) throw new DomainError('NO_ACCOUNT');
    const account = await this.effectiveAccount(this.db, obligation.userId);
    if (!account) throw new DomainError('NO_ACCOUNT');
    await this.audit.record(null, actor, {
      action: 'payout_account.revealed',
      targetType: 'payout_obligation',
      targetId: id,
      metadata: { payoutAccountId: account.id },
    });
    return {
      bankName: account.bankName,
      accountNumber: this.encryption.decrypt(account.accountNumberEnc),
      accountName: account.accountName,
    };
  }

  async start(actor: Actor, id: string, nameEnquiryName: string): Promise<AdminObligation> {
    await this.db.transaction(async (tx) => {
      const obligation = await this.require(tx, id, true);
      if (obligation.status !== 'ready') throw new DomainError('BAD_STATUS');
      const account = obligation.userId ? await this.effectiveAccount(tx, obligation.userId) : null;
      if (obligation.userId && !account) throw new DomainError('NO_ACCOUNT');
      await tx.insert(payoutAttempts).values({
        obligationId: id,
        amountKobo: obligation.amountKobo,
        accountSnapshot: account
          ? {
              payoutAccountId: account.id,
              bankName: account.bankName,
              bankCode: account.bankCode,
              last4: account.last4,
              accountName: account.accountName,
            }
          : null,
        nameEnquiryName,
        startedByAdminId: this.adminId(actor),
      });
      await tx
        .update(payoutObligations)
        .set({ status: 'processing' })
        .where(and(eq(payoutObligations.id, id), eq(payoutObligations.status, 'ready')));
      await this.audit.record(tx, actor, {
        action: 'payout.started',
        targetType: 'payout_obligation',
        targetId: id,
        metadata: { nameEnquiryName, accountName: account?.accountName ?? null },
      });
    });
    return this.adminView(id);
  }

  /** Records the bank transfer. Exactly one paid attempt can ever exist per obligation. */
  async markPaid(actor: Actor, id: string, transferReference: string, amountKobo: number) {
    await this.db.transaction(async (tx) => {
      const obligation = await this.require(tx, id, true);
      if (obligation.status === 'paid') {
        const [same] = await tx
          .select()
          .from(payoutAttempts)
          .where(and(eq(payoutAttempts.obligationId, id), eq(payoutAttempts.status, 'paid')));
        if (same?.transferReference === transferReference) return;
        throw new DomainError('BAD_STATUS');
      }
      if (obligation.status !== 'processing') throw new DomainError('BAD_STATUS');
      if (amountKobo !== obligation.amountKobo) throw new DomainError('AMOUNT_MISMATCH');
      const [attempt] = await tx
        .select()
        .from(payoutAttempts)
        .where(and(eq(payoutAttempts.obligationId, id), eq(payoutAttempts.status, 'pending')))
        .for('update');
      if (!attempt) throw new DomainError('BAD_STATUS');
      try {
        await tx
          .update(payoutAttempts)
          .set({
            status: 'paid',
            transferReference,
            completedAt: new Date(),
            completedByAdminId: this.adminId(actor),
          })
          .where(eq(payoutAttempts.id, attempt.id));
      } catch (error) {
        if (isUniqueViolation(error, 'payout_attempts_reference'))
          throw new DomainError('DUPLICATE_REFERENCE');
        throw error;
      }
      await tx
        .update(payoutObligations)
        .set({ status: 'paid', statusNote: null })
        .where(and(eq(payoutObligations.id, id), eq(payoutObligations.status, 'processing')));
      await this.ledger.post(tx, actor, {
        eventKey: `payout_paid:${attempt.id}`,
        legs: [
          {
            account: obligation.kind === 'refund' ? 'refunds_paid' : 'payouts_paid',
            amountKobo: obligation.amountKobo,
          },
        ],
        dayId: obligation.matchDayId,
        jackpotId: obligation.jackpotId,
        refType: 'payout_obligation',
        refId: obligation.id,
      });
      await this.audit.record(tx, actor, {
        action: 'payout.paid',
        targetType: 'payout_obligation',
        targetId: id,
        metadata: { transferReference, amountKobo },
      });
      if (obligation.matchDayId) await this.maybeCompleteDay(tx, obligation.matchDayId);
    });
    return this.adminView(id);
  }

  async markFailed(actor: Actor, id: string, reason: string) {
    await this.db.transaction(async (tx) => {
      const obligation = await this.require(tx, id, true);
      if (obligation.status !== 'processing') throw new DomainError('BAD_STATUS');
      await tx
        .update(payoutAttempts)
        .set({
          status: 'failed',
          failureReason: reason,
          completedAt: new Date(),
          completedByAdminId: this.adminId(actor),
        })
        .where(and(eq(payoutAttempts.obligationId, id), eq(payoutAttempts.status, 'pending')));
      await tx
        .update(payoutObligations)
        .set({ status: 'ready', statusNote: 'The last transfer failed and will be retried.' })
        .where(eq(payoutObligations.id, id));
      await this.audit.record(tx, actor, {
        action: 'payout.failed',
        targetType: 'payout_obligation',
        targetId: id,
        reason,
      });
    });
    return this.adminView(id);
  }

  /** The account didn't check out: ask the player for new details (and text them). */
  async invalidDetails(actor: Actor, id: string, reason: string) {
    await this.db.transaction(async (tx) => {
      const obligation = await this.require(tx, id, true);
      if (obligation.status !== 'ready' && obligation.status !== 'processing') {
        throw new DomainError('BAD_STATUS');
      }
      if (obligation.status === 'processing') {
        await tx
          .update(payoutAttempts)
          .set({
            status: 'failed',
            failureReason: reason,
            completedAt: new Date(),
            completedByAdminId: this.adminId(actor),
          })
          .where(and(eq(payoutAttempts.obligationId, id), eq(payoutAttempts.status, 'pending')));
      }
      await tx
        .update(payoutObligations)
        .set({ status: 'details_invalid', statusNote: reason })
        .where(eq(payoutObligations.id, id));
      if (obligation.userId) {
        const [user] = await tx.select().from(users).where(eq(users.id, obligation.userId));
        if (user) {
          await this.sms.queue(
            tx,
            user.phone,
            `${product.name}: we couldn't pay your ${formatNaira(obligation.amountKobo)}. Please check your bank details in the app.`,
            'notice',
            user.id,
          );
        }
      }
      await this.audit.record(tx, actor, {
        action: 'payout.details_invalid',
        targetType: 'payout_obligation',
        targetId: id,
        reason,
      });
    });
    return this.adminView(id);
  }

  async hold(actor: Actor, id: string, reason: string, hold: boolean) {
    await this.db.transaction(async (tx) => {
      const obligation = await this.require(tx, id, true);
      if (hold) {
        if (obligation.status === 'paid' || obligation.status === 'processing')
          throw new DomainError('BAD_STATUS');
        await tx
          .update(payoutObligations)
          .set({ status: 'on_hold', statusNote: reason })
          .where(eq(payoutObligations.id, id));
      } else {
        if (obligation.status !== 'on_hold') throw new DomainError('BAD_STATUS');
        const account = obligation.userId
          ? await this.effectiveAccount(tx, obligation.userId)
          : null;
        await tx
          .update(payoutObligations)
          .set({
            status: !obligation.userId || account ? 'ready' : 'awaiting_details',
            statusNote: null,
          })
          .where(eq(payoutObligations.id, id));
      }
      await this.audit.record(tx, actor, {
        action: hold ? 'payout.held' : 'payout.released',
        targetType: 'payout_obligation',
        targetId: id,
        reason,
      });
    });
    return this.adminView(id);
  }

  /** Turns the unused part of a transfer into a refund (to a player, or back to the sender). */
  async refundTransfer(actor: Actor, bankPaymentId: string, reason: string, userId?: string) {
    const id = await this.db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(bankPayments)
        .where(eq(bankPayments.id, bankPaymentId))
        .for('update');
      if (!payment) throw new DomainError('NOT_FOUND');
      const unapplied = await this.payments.unapplied(tx, payment);
      if (unapplied <= 0) throw new DomainError('NOTHING_TO_REFUND');
      const obligation = await this.create(tx, {
        kind: 'refund',
        userId: userId ?? null,
        bankPaymentId,
        amountKobo: unapplied,
        reason,
      });
      await this.ledger.post(tx, actor, {
        eventKey: `refund_owed:${obligation!.id}`,
        legs: [{ account: 'refunds_owed', amountKobo: unapplied }],
        refType: 'payout_obligation',
        refId: obligation!.id,
        memo: reason,
      });
      await this.audit.record(tx, actor, {
        action: 'bank_payment.refund_created',
        targetType: 'bank_payment',
        targetId: bankPaymentId,
        reason,
        metadata: { amountKobo: unapplied, obligationId: obligation!.id },
      });
      return obligation!.id;
    });
    return this.adminView(id);
  }

  /** A finalized day is completed once everything it owes has been paid. */
  async maybeCompleteDay(executor: Executor, dayId: string) {
    const [open] = await executor
      .select({ n: count() })
      .from(payoutObligations)
      .where(
        and(
          eq(payoutObligations.matchDayId, dayId),
          isNull(payoutObligations.supersededAt),
          sql`${payoutObligations.status} <> 'paid'`,
        ),
      );
    if ((open?.n ?? 0) === 0) {
      await executor
        .update(matchDays)
        .set({ status: 'completed' })
        .where(and(eq(matchDays.id, dayId), eq(matchDays.status, 'finalized')));
    }
  }

  async effectiveAccount(executor: Executor, userId: string): Promise<AccountRow | null> {
    const [row] = await executor
      .select()
      .from(payoutAccounts)
      .where(
        and(
          eq(payoutAccounts.userId, userId),
          isNull(payoutAccounts.cancelledAt),
          lte(payoutAccounts.activeFrom, new Date()),
        ),
      )
      .orderBy(desc(payoutAccounts.activeFrom))
      .limit(1);
    return row ?? null;
  }

  async adminView(id: string): Promise<AdminObligation> {
    const row = await this.require(this.db, id);
    const [view] = await this.adminViews([row]);
    return view!;
  }

  private async adminViews(rows: ObligationRow[]): Promise<AdminObligation[]> {
    if (rows.length === 0) return [];
    const userIds = [
      ...new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id))),
    ];
    const people = userIds.length
      ? await this.db.select().from(users).where(inArray(users.id, userIds))
      : [];
    const labels = await this.labels(rows);
    const attempts = await this.db
      .select()
      .from(payoutAttempts)
      .where(
        inArray(
          payoutAttempts.obligationId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(desc(payoutAttempts.startedAt));
    const accounts = new Map<string, AccountRow | null>();
    for (const userId of userIds)
      accounts.set(userId, await this.effectiveAccount(this.db, userId));
    const fingerprints = [...accounts.values()]
      .filter((a): a is AccountRow => a !== null)
      .map((a) => a.fingerprint);
    const shared = fingerprints.length
      ? await this.db
          .select({
            fingerprint: payoutAccounts.fingerprint,
            users: countDistinct(payoutAccounts.userId),
          })
          .from(payoutAccounts)
          .where(
            and(
              inArray(payoutAccounts.fingerprint, fingerprints),
              isNull(payoutAccounts.cancelledAt),
            ),
          )
          .groupBy(payoutAccounts.fingerprint)
      : [];
    return rows.map((row) => {
      const user = people.find((p) => p.id === row.userId);
      const account = row.userId ? (accounts.get(row.userId) ?? null) : null;
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        amountKobo: row.amountKobo,
        label: labels.get(row.id) ?? '',
        rank: row.rank,
        reason: row.reason,
        statusNote: row.statusNote,
        user: user ? { id: user.id, displayName: user.displayName, phone: user.phone } : null,
        account: account ? accountView(account) : null,
        sharedAccountUsers: account
          ? (shared.find((s) => s.fingerprint === account.fingerprint)?.users ?? 1)
          : 0,
        attempts: attempts
          .filter((attempt) => attempt.obligationId === row.id)
          .map((attempt) => ({
            id: attempt.id,
            status: attempt.status,
            amountKobo: attempt.amountKobo,
            bankName: attempt.accountSnapshot?.bankName ?? null,
            last4: attempt.accountSnapshot?.last4 ?? null,
            accountName: attempt.accountSnapshot?.accountName ?? null,
            nameEnquiryName: attempt.nameEnquiryName,
            transferReference: attempt.transferReference,
            failureReason: attempt.failureReason,
            startedAt: attempt.startedAt,
            completedAt: attempt.completedAt,
          })),
        createdAt: row.createdAt,
      };
    });
  }

  /** "Prize · 18 Oct (3rd)", "Refund · 18 Oct", "Jackpot · NVPL 2026". */
  private async labels(rows: ObligationRow[]): Promise<Map<string, string>> {
    const dayIds = [
      ...new Set(rows.map((r) => r.matchDayId).filter((id): id is string => Boolean(id))),
    ];
    const jackpotIds = [
      ...new Set(rows.map((r) => r.jackpotId).filter((id): id is string => Boolean(id))),
    ];
    const days = dayIds.length
      ? await this.db.select().from(matchDays).where(inArray(matchDays.id, dayIds))
      : [];
    const pots = jackpotIds.length
      ? await this.db
          .select({ id: jackpots.id, name: leagues.name })
          .from(jackpots)
          .innerJoin(leagues, eq(leagues.id, jackpots.leagueId))
          .where(inArray(jackpots.id, jackpotIds))
      : [];
    const kindLabel = { prize: 'Prize', refund: 'Refund', jackpot: 'Jackpot' } as const;
    return new Map(
      rows.map((row) => {
        const day = days.find((d) => d.id === row.matchDayId);
        const pot = pots.find((p) => p.id === row.jackpotId);
        const what = day ? day.date : pot ? pot.name : (row.reason ?? '');
        return [row.id, `${kindLabel[row.kind]} · ${what}`];
      }),
    );
  }

  private async paidAttempts(ids: string[]): Promise<Map<string, Date>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({
        obligationId: payoutAttempts.obligationId,
        completedAt: payoutAttempts.completedAt,
      })
      .from(payoutAttempts)
      .where(and(inArray(payoutAttempts.obligationId, ids), eq(payoutAttempts.status, 'paid')));
    return new Map(rows.filter((r) => r.completedAt).map((r) => [r.obligationId, r.completedAt!]));
  }

  private async require(executor: Executor, id: string, forUpdate = false): Promise<ObligationRow> {
    const query = executor.select().from(payoutObligations).where(eq(payoutObligations.id, id));
    const [row] = forUpdate ? await query.for('update') : await query;
    if (!row) throw new DomainError('NOT_FOUND');
    return row;
  }

  private adminId(actor: Actor): string {
    if (actor.type !== 'admin') throw new Error('Payout actions need an admin');
    return actor.id;
  }
}

function accountView(row: AccountRow): PayoutAccountView {
  return {
    bankCode: row.bankCode,
    bankName: row.bankName,
    last4: row.last4,
    accountName: row.accountName,
    activeFrom: row.activeFrom,
  };
}
