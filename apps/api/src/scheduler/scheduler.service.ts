import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, eq, isNotNull, jackpots, lte, matchDays, sql, type Database } from '@predict/db';
import { AuditService } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';
import { ObligationsService } from '../payouts/obligations.service';
import { DaysService } from '../setup/days.service';
import { EmailService } from '../email/email.service';

/**
 * Background housekeeping on a timer: scheduled openings and closings, jackpot entry deadlines
 * and the email outbox. Every step is an idempotent conditional update, so running it on several
 * instances (or twice) is harmless. Nothing about fairness depends on it: locks and cutoffs are
 * always computed from timestamps when a request arrives.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Database,
    private readonly days: DaysService,
    private readonly obligations: ObligationsService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly cache: TtlCache,
  ) {}

  onApplicationBootstrap() {
    if (this.env.TICKER_INTERVAL_SEC <= 0) return;
    this.timer = setInterval(() => void this.tick(), this.env.TICKER_INTERVAL_SEC * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.openScheduledDays();
      await this.closeScheduledDays();
      await this.closeJackpots();
      // Bank details changed 24 hours ago are now in force: payouts waiting on them can go.
      await this.obligations.promoteReady(this.db);
      await this.email.processOutbox();
    } catch (error) {
      this.logger.error(`Tick failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Opens published days whose opening time has come (if they're ready). */
  async openScheduledDays() {
    const due = await this.db
      .select({ id: matchDays.id })
      .from(matchDays)
      .where(
        and(
          eq(matchDays.status, 'published'),
          isNotNull(matchDays.opensAt),
          lte(matchDays.opensAt, new Date()),
        ),
      );
    for (const { id } of due) {
      try {
        await this.db.transaction(async (tx) => {
          const [day] = await tx
            .select()
            .from(matchDays)
            .where(eq(matchDays.id, id))
            .for('update', { skipLocked: true });
          if (!day || day.status !== 'published') return;
          await this.days.openLocked(tx, day, { type: 'system' });
          await this.audit.record(
            tx,
            { type: 'system' },
            {
              action: 'day.auto_opened',
              targetType: 'match_day',
              targetId: id,
            },
          );
        });
      } catch (error) {
        const blockers =
          error instanceof DomainError ? (error.data?.blockers as string[] | undefined) : undefined;
        // Clear the schedule so it isn't retried every tick; staff see why in the audit log.
        await this.db.transaction(async (tx) => {
          await tx.update(matchDays).set({ opensAt: null }).where(eq(matchDays.id, id));
          await this.audit.record(
            tx,
            { type: 'system' },
            {
              action: 'day.auto_open_failed',
              targetType: 'match_day',
              targetId: id,
              metadata: { blockers: blockers ?? [(error as Error).message] },
            },
          );
        });
      }
      this.cache.invalidate('public:');
    }
  }

  /** Closes open days whose scheduled close has passed, at that scheduled moment. */
  async closeScheduledDays() {
    const closed = await this.db
      .update(matchDays)
      .set({ status: 'closed', closedAt: sql`${matchDays.submissionsCloseAt}` })
      .where(and(eq(matchDays.status, 'open'), lte(matchDays.submissionsCloseAt, new Date())))
      .returning({ id: matchDays.id });
    for (const { id } of closed) {
      await this.audit.record(
        null,
        { type: 'system' },
        {
          action: 'day.auto_closed',
          targetType: 'match_day',
          targetId: id,
        },
      );
    }
    if (closed.length > 0) this.cache.invalidate('public:');
  }

  async closeJackpots() {
    const closed = await this.db
      .update(jackpots)
      .set({ status: 'closed' })
      .where(and(eq(jackpots.status, 'open'), lte(jackpots.entryClosesAt, new Date())))
      .returning({ id: jackpots.id });
    if (closed.length > 0) this.cache.invalidate('public:');
  }
}
