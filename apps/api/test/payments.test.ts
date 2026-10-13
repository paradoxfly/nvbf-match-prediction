import { ledgerEntries, sql } from '@predict/db';
import { isValidPaymentReference } from '@predict/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminClient } from './support/admin';
import { openContest, transfer, watDay } from './support/contest';
import { createTestApp, type TestApp } from './support/test-app';

describe('entries and payment reconciliation', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.reset();
  });

  async function joined(phone = '+2348031234567', name = 'Ada Obi') {
    const setup = await openContest(t);
    const player = await t.player(phone, name);
    const entry = await player.post(`/v1/me/days/${setup.date}/join`).send({}).expect(200);
    return { ...setup, player, entry: entry.body };
  }

  async function pool(date: string) {
    const res = await t.raw().get(`/v1/public/days/${date}`).expect(200);
    return res.body.pool as {
      confirmedEntries: number;
      dailyPoolKobo: number;
      jackpotCutKobo: number;
    };
  }

  it('gives each entry a checkable payment reference and joining twice returns the same entry', async () => {
    const { player, date, entry } = await joined();
    expect(entry.status).toBe('awaiting_payment');
    expect(isValidPaymentReference(entry.paymentReference)).toBe(true);
    const again = await player.post(`/v1/me/days/${date}/join`).send({}).expect(200);
    expect(again.body.id).toBe(entry.id);

    const mine = await player.get(`/v1/me/days/${date}`).expect(200);
    expect(mine.body.collectionAccount.accountNumber).toBe('0123456789');
  });

  it('moves to review on an "I paid" note, then finance confirms against the statement', async () => {
    const { player, date, entry } = await joined();
    const claimed = await player
      .post(`/v1/me/entries/${entry.id}/claim`)
      .send({ senderName: 'ADA OBI', amountKobo: 50_000, paidAt: new Date().toISOString() })
      .expect(200);
    expect(claimed.body.status).toBe('payment_review');

    const finance = await adminClient(t, 'finance');
    const queue = await finance.get('/v1/admin/payments/queue?status=payment_review').expect(200);
    expect(queue.body.items[0]).toMatchObject({
      entryId: entry.id,
      latestClaim: { senderName: 'ADA OBI', status: 'pending' },
    });

    const body = { transfer: transfer({ bankReference: 'nip 000111' }) };
    const res = await finance.post(`/v1/admin/entries/${entry.id}/confirm`).send(body).expect(200);
    expect(res.body.entry.status).toBe('confirmed');
    expect(res.body.transfer).toMatchObject({
      bankReference: 'NIP000111',
      appliedKobo: 50_000,
      unappliedKobo: 0,
    });

    // ₦500 → 80% prize money = ₦400, of which 10% (₦40) goes to the jackpot.
    expect(await pool(date)).toMatchObject({
      confirmedEntries: 1,
      dailyPoolKobo: 36_000,
      jackpotCutKobo: 4_000,
    });

    // Confirming again with the same transfer changes nothing (no second ledger row).
    await finance.post(`/v1/admin/entries/${entry.id}/confirm`).send(body).expect(200);
    const ledger = await t.db.select().from(ledgerEntries);
    expect(ledger.filter((row) => row.account === 'collections')).toHaveLength(1);
  });

  it('never lets one transfer pay for more than it carries', async () => {
    const setup = await joined();
    const second = await t.player('+2348061234567', 'Bayo');
    const other = await second.post(`/v1/me/days/${setup.date}/join`).send({}).expect(200);
    const finance = await adminClient(t, 'finance');
    const single = transfer({ bankReference: 'ONE' });

    await finance
      .post(`/v1/admin/entries/${setup.entry.id}/confirm`)
      .send({ transfer: single })
      .expect(200);
    const res = await finance
      .post(`/v1/admin/entries/${other.body.id}/confirm`)
      .send({ transfer: single });
    expect(res.body.code).toBe('INSUFFICIENT_FUNDS');

    // A double transfer can cover both (one friend paying for another).
    const third = await t.player('+2348131234567', 'Chidi');
    const thirdEntry = await third.post(`/v1/me/days/${setup.date}/join`).send({}).expect(200);
    const double = transfer({ bankReference: 'TWO', amountKobo: 100_000 });
    await finance
      .post(`/v1/admin/entries/${other.body.id}/confirm`)
      .send({ transfer: double })
      .expect(200);
    const both = await finance
      .post(`/v1/admin/entries/${thirdEntry.body.id}/confirm`)
      .send({ transfer: double })
      .expect(200);
    expect(both.body.transfer).toMatchObject({ appliedKobo: 100_000, unappliedKobo: 0 });
  });

  it('refuses a confirmed entry a second transfer, mismatched references and late money', async () => {
    const { entry, date } = await joined();
    const finance = await adminClient(t, 'finance');
    await finance
      .post(`/v1/admin/entries/${entry.id}/confirm`)
      .send({ transfer: transfer({ bankReference: 'A1' }) })
      .expect(200);

    const second = await finance
      .post(`/v1/admin/entries/${entry.id}/confirm`)
      .send({ transfer: transfer({ bankReference: 'B2' }) });
    expect(second.body.code).toBe('ALREADY_CONFIRMED');

    const player = await t.player('+2348061234567', 'Bayo');
    const late = await player.post(`/v1/me/days/${date}/join`).send({}).expect(200);
    const mismatch = await finance
      .post(`/v1/admin/entries/${late.body.id}/confirm`)
      .send({ transfer: transfer({ bankReference: 'A1', amountKobo: 70_000 }) });
    expect(mismatch.body.code).toBe('TRANSFER_MISMATCH');

    // A credited time in the future is a typo, not a payment.
    const afterwards = new Date(`${watDay(2)}T12:00:00+01:00`);
    const future = await finance
      .post(`/v1/admin/entries/${late.body.id}/confirm`)
      .send({ transfer: transfer({ bankReference: 'FUTURE', creditedAt: afterwards }) });
    expect(future.body.code).toBe('CREDITED_IN_FUTURE');

    // Money that arrived after the last match locked can't confirm an entry.
    await t.db.execute(sql`update matches set actual_start_at = now() - interval '10 minutes'`);
    const lateRes = await finance
      .post(`/v1/admin/entries/${late.body.id}/confirm`)
      .send({ transfer: transfer({ bankReference: 'LATE', creditedAt: new Date() }) });
    expect(lateRes.body.code).toBe('LATE_PAYMENT');
  });

  it('revoking a mistaken confirmation never shrinks the pool', async () => {
    const { entry, date } = await joined();
    const finance = await adminClient(t, 'finance');
    await finance
      .post(`/v1/admin/entries/${entry.id}/confirm`)
      .send({ transfer: transfer() })
      .expect(200);
    const before = await pool(date);

    // Only super admins can revoke.
    await finance
      .post(`/v1/admin/entries/${entry.id}/revoke`)
      .send({ reason: 'Wrong entry' })
      .expect(403);
    const boss = await adminClient(t, 'super_admin', 'boss@predict.test');
    const res = await boss
      .post(`/v1/admin/entries/${entry.id}/revoke`)
      .send({ reason: 'Wrong entry' })
      .expect(200);
    expect(res.body.status).toBe('awaiting_payment');

    const after = await pool(date);
    expect(after.confirmedEntries).toBe(0);
    expect(after.dailyPoolKobo).toBe(before.dailyPoolKobo);
  });

  it('rejecting a claim sends the entry back to "waiting for payment"', async () => {
    const { player, entry } = await joined();
    await player
      .post(`/v1/me/entries/${entry.id}/claim`)
      .send({ senderName: 'ADA', amountKobo: 50_000, paidAt: new Date().toISOString() })
      .expect(200);
    const finance = await adminClient(t, 'finance');
    const res = await finance
      .post(`/v1/admin/entries/${entry.id}/reject-claim`)
      .send({ reason: 'No matching transfer on the statement' })
      .expect(200);
    expect(res.body.status).toBe('awaiting_payment');
    expect(res.body.latestClaim.status).toBe('rejected');
  });

  it('counts only allocated sponsor money in the guaranteed pool', async () => {
    const { dayId, date } = await joined();
    const finance = await adminClient(t, 'finance');
    const pledge = await finance
      .post('/v1/admin/contributions')
      .send({
        source: 'sponsor',
        dayId,
        amountKobo: 1_000_000,
        sponsorName: 'Acme',
        received: false,
      })
      .expect(200);
    const home = await t.raw().get(`/v1/public/days/${date}`).expect(200);
    expect(home.body.pool.dailyPoolKobo).toBe(0);
    expect(home.body.pledgedKobo).toBe(1_000_000);

    await finance.post(`/v1/admin/contributions/${pledge.body.id}/allocate`).send({}).expect(200);
    const after = await t.raw().get(`/v1/public/days/${date}`).expect(200);
    expect(after.body.pool.dailyPoolKobo).toBe(1_000_000);
    expect(after.body.sponsors[0]).toMatchObject({ name: 'Acme', amountKobo: 1_000_000 });

    // The day is open, so allocated money can't be taken back.
    const back = await finance
      .post(`/v1/admin/contributions/${pledge.body.id}/return`)
      .send({ reason: 'Sponsor pulled out' });
    expect(back.body.code).toBe('TARGET_CLOSED');
  });

  it('keeps the money journal append-only', async () => {
    const { entry } = await joined();
    const finance = await adminClient(t, 'finance');
    await finance
      .post(`/v1/admin/entries/${entry.id}/confirm`)
      .send({ transfer: transfer() })
      .expect(200);
    const reason = (error: unknown) => {
      const failure = error as { message?: string; cause?: { message?: string } };
      return `${failure.message} ${failure.cause?.message ?? ''}`;
    };
    const edit = await t.db.execute(sql`update ledger_entries set amount_kobo = 1`).catch(reason);
    const wipe = await t.db.execute(sql`delete from audit_logs`).catch(reason);
    expect(edit).toMatch(/append-only/);
    expect(wipe).toMatch(/append-only/);
  });
});
