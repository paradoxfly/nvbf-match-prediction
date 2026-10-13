import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SmsPurpose } from '@predict/contracts';
import { and, count, eq, gte, smsMessages, sql, type Database, type Executor } from '@predict/db';
import { DomainError } from '../common/domain-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB } from '../database/database.module';
import { SMS_PROVIDER, type SmsProvider } from './sms-provider';

const MAX_ATTEMPTS = 3;
/** A claimed outbox row is retried after this long if the sender crashed mid-send. */
const CLAIM_LEASE_SEC = 300;

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
  ) {}

  /**
   * Sends straight away (sign-in codes can't wait) and records the attempt. The body is only
   * stored when `storeBody` is true: OTP codes are never written to the database.
   */
  async sendNow(
    to: string,
    body: string,
    purpose: SmsPurpose,
    options: { userId?: string | null; ipHash?: string | null; storeBody: boolean },
  ): Promise<void> {
    await this.assertDailyCap();
    const [row] = await this.db
      .insert(smsMessages)
      .values({
        toPhone: to,
        purpose,
        body: options.storeBody ? body : null,
        provider: this.provider.name,
        attempts: 1,
        userId: options.userId ?? null,
        ipHash: options.ipHash ?? null,
      })
      .returning({ id: smsMessages.id });

    try {
      const result = await this.provider.send(to, body, purpose);
      await this.db
        .update(smsMessages)
        .set({ status: 'sent', providerMessageId: result.providerMessageId, sentAt: new Date() })
        .where(eq(smsMessages.id, row!.id));
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      this.logger.error(`SMS ${purpose} to ${to.slice(0, 7)}… failed: ${message}`);
      await this.db
        .update(smsMessages)
        .set({ status: 'failed', error: message })
        .where(eq(smsMessages.id, row!.id));
      throw new DomainError('SMS_FAILED');
    }
  }

  /** Queues a notification; the ticker sends it. Joins the caller's transaction if given one. */
  async queue(
    executor: Executor,
    to: string,
    body: string,
    purpose: SmsPurpose,
    userId: string | null = null,
  ) {
    await executor.insert(smsMessages).values({
      toPhone: to,
      purpose,
      body,
      provider: this.provider.name,
      userId,
    });
  }

  /** Sends a batch of queued notifications. Safe to run on several instances at once. */
  async processOutbox(limit = 20): Promise<number> {
    const claimed = await this.db.execute<{
      id: string;
      to_phone: string;
      body: string | null;
      purpose: SmsPurpose;
      attempts: number;
    }>(sql`
      update ${smsMessages}
      set attempts = attempts + 1, send_after = now() + make_interval(secs => ${CLAIM_LEASE_SEC})
      where id in (
        select id from ${smsMessages}
        where status = 'queued' and send_after <= now()
        order by created_at
        for update skip locked
        limit ${limit}
      )
      returning id, to_phone, body, purpose, attempts
    `);

    for (const message of claimed.rows) {
      try {
        await this.assertDailyCap();
        const result = await this.provider.send(
          message.to_phone,
          message.body ?? '',
          message.purpose,
        );
        await this.db
          .update(smsMessages)
          .set({ status: 'sent', providerMessageId: result.providerMessageId, sentAt: new Date() })
          .where(eq(smsMessages.id, message.id));
      } catch (error) {
        const finalAttempt = message.attempts >= MAX_ATTEMPTS;
        await this.db
          .update(smsMessages)
          .set({
            status: finalAttempt ? 'failed' : 'queued',
            error: (error as Error).message.slice(0, 500),
            sendAfter: new Date(Date.now() + 60_000 * message.attempts),
          })
          .where(eq(smsMessages.id, message.id));
      }
    }
    return claimed.rows.length;
  }

  /** Texts sent or attempted to one number since `since` (durable per-phone limits). */
  async countSince(to: string, since: Date, purpose: SmsPurpose): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(smsMessages)
      .where(
        and(
          eq(smsMessages.toPhone, to),
          eq(smsMessages.purpose, purpose),
          gte(smsMessages.createdAt, since),
        ),
      );
    return row?.n ?? 0;
  }

  /** A hard ceiling on texts per rolling 24 hours, so abuse can't run up an unbounded bill. */
  private async assertDailyCap() {
    const [row] = await this.db
      .select({ n: count() })
      .from(smsMessages)
      .where(gte(smsMessages.createdAt, new Date(Date.now() - 24 * 3600_000)));
    if ((row?.n ?? 0) >= this.env.SMS_DAILY_CAP) {
      this.logger.error(`Daily SMS cap (${this.env.SMS_DAILY_CAP}) reached; refusing to send.`);
      throw new DomainError('SMS_FAILED');
    }
  }
}
