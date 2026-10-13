import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EmailPurpose } from '@predict/contracts';
import {
  count,
  emailMessages,
  eq,
  gte,
  sql,
  type Database,
  type EmailContent,
  type Executor,
} from '@predict/db';
import { DomainError } from '../common/domain-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB } from '../database/database.module';
import { EMAIL_TRANSPORT, type EmailTransport, type OutgoingEmail } from './email-transport';

const MAX_ATTEMPTS = 3;
/** A claimed outbox row is retried after this long if the sender crashed mid-send. */
const CLAIM_LEASE_SEC = 300;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
  ) {}

  /** A link to a page on the player site, for buttons in emails. */
  link(path: string): string {
    return `${this.env.WEB_ORIGIN.replace(/\/$/, '')}${path}`;
  }

  /**
   * Sends straight away (sign-in codes can't wait) and records the attempt. Sign-in emails are
   * recorded without their content: codes are never written to the database.
   */
  async sendNow(
    to: string,
    email: OutgoingEmail,
    purpose: EmailPurpose,
    options: { userId?: string | null; ipHash?: string | null },
  ): Promise<void> {
    await this.assertDailyCap();
    const [row] = await this.db
      .insert(emailMessages)
      .values({
        toEmail: to,
        purpose,
        // The code may be in the subject (it shows in phone notifications); never store it.
        subject: email.code ? email.subject.replaceAll(email.code, '******') : email.subject,
        content: email.code ? null : contentOf(email),
        provider: this.transport.name,
        attempts: 1,
        userId: options.userId ?? null,
        ipHash: options.ipHash ?? null,
      })
      .returning({ id: emailMessages.id });

    try {
      const result = await this.transport.send(to, email, purpose);
      await this.db
        .update(emailMessages)
        .set({ status: 'sent', providerMessageId: result.providerMessageId, sentAt: new Date() })
        .where(eq(emailMessages.id, row!.id));
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      this.logger.error(`Email ${purpose} to ${maskEmail(to)} failed: ${message}`);
      await this.db
        .update(emailMessages)
        .set({ status: 'failed', error: message })
        .where(eq(emailMessages.id, row!.id));
      throw new DomainError('EMAIL_FAILED');
    }
  }

  /** Queues a notification; the ticker sends it. Joins the caller's transaction if given one. */
  async queue(
    executor: Executor,
    to: string,
    content: EmailContent,
    purpose: EmailPurpose,
    userId: string | null = null,
  ) {
    await executor.insert(emailMessages).values({
      toEmail: to,
      purpose,
      subject: content.subject,
      content: contentOf(content),
      provider: this.transport.name,
      userId,
    });
  }

  /** Sends a batch of queued notifications. Safe to run on several instances at once. */
  async processOutbox(limit = 20): Promise<number> {
    const claimed = await this.db.execute<{
      id: string;
      to_email: string;
      content: EmailContent | null;
      purpose: EmailPurpose;
      attempts: number;
    }>(sql`
      update ${emailMessages}
      set attempts = attempts + 1, send_after = now() + make_interval(secs => ${CLAIM_LEASE_SEC})
      where id in (
        select id from ${emailMessages}
        where status = 'queued' and send_after <= now()
        order by created_at
        for update skip locked
        limit ${limit}
      )
      returning id, to_email, content, purpose, attempts
    `);

    for (const message of claimed.rows) {
      try {
        if (!message.content) throw new Error('Nothing to send.');
        await this.assertDailyCap();
        const result = await this.transport.send(
          message.to_email,
          message.content,
          message.purpose,
        );
        await this.db
          .update(emailMessages)
          .set({ status: 'sent', providerMessageId: result.providerMessageId, sentAt: new Date() })
          .where(eq(emailMessages.id, message.id));
      } catch (error) {
        const finalAttempt = message.attempts >= MAX_ATTEMPTS;
        await this.db
          .update(emailMessages)
          .set({
            status: finalAttempt ? 'failed' : 'queued',
            error: (error as Error).message.slice(0, 500),
            sendAfter: new Date(Date.now() + 60_000 * message.attempts),
          })
          .where(eq(emailMessages.id, message.id));
      }
    }
    return claimed.rows.length;
  }

  /** A hard ceiling on emails per rolling 24 hours, so abuse can't burn the plan's volume. */
  private async assertDailyCap() {
    const [row] = await this.db
      .select({ n: count() })
      .from(emailMessages)
      .where(gte(emailMessages.createdAt, new Date(Date.now() - 24 * 3600_000)));
    if ((row?.n ?? 0) >= this.env.EMAIL_DAILY_CAP) {
      this.logger.error(`Daily email cap (${this.env.EMAIL_DAILY_CAP}) reached; refusing to send.`);
      throw new DomainError('EMAIL_FAILED');
    }
  }
}

/** The storable part of an email (never a sign-in code). */
function contentOf(email: EmailContent): EmailContent {
  const { subject, heading, paragraphs, action } = email;
  return action ? { subject, heading, paragraphs, action } : { subject, heading, paragraphs };
}

/** "ad***@example.com" for logs. */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}
