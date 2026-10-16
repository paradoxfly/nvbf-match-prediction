import {
  auditLogs,
  entries,
  eq,
  jackpotEntries,
  ledgerEntries,
  matches,
  payoutObligations,
  sql,
  type Database,
} from '@predict/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminClient } from './support/admin';
import { openContest, transfer, type ContestSetup } from './support/contest';
import { createTestApp, type TestApp } from './support/test-app';

type Agent = ReturnType<TestApp['client']>;
type Sets = Array<{ home: number; away: number }>;

// Match 1 (16:00) ends 3–1 to the home side; match 2 (18:00) ends 0–3.
const RESULT_1: Sets = [
  { home: 25, away: 20 },
  { home: 22, away: 25 },
  { home: 25, away: 18 },
  { home: 25, away: 23 },
];
const RESULT_2: Sets = [
  { home: 20, away: 25 },
  { home: 18, away: 25 },
  { home: 23, away: 25 },
];

async function ledgerTotals(db: Database, dayId: string) {
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(sql`${ledgerEntries.matchDayId} = ${dayId}`);
  const totals: Record<string, number> = {};
  for (const row of rows) totals[row.account] = (totals[row.account] ?? 0) + row.amountKobo;
  return totals;
}

describe('a full match-day', () => {
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

  async function playerWithPicks(
    setup: ContestSetup,
    phone: string,
    name: string,
    picks: [Sets, Sets],
  ) {
    const player = await t.player(phone, name);
    const saved = await player
      .put(`/v1/me/days/${setup.date}/predictions`)
      .send({
        date: setup.date,
        predictions: [
          { matchId: setup.matchIds[0], sets: picks[0] },
          { matchId: setup.matchIds[1], sets: picks[1] },
        ],
      })
      .expect(200);
    expect(saved.body.rejected).toEqual([]);
    const mine = await player.get(`/v1/me/days/${setup.date}`).expect(200);
    return { player, entryId: mine.body.entry.id as string };
  }

  async function confirmPayment(finance: Agent, entryId: string, creditedAt = new Date()) {
    await finance
      .post(`/v1/admin/entries/${entryId}/confirm`)
      .send({ transfer: transfer({ creditedAt }) })
      .expect(200);
  }

  async function enterAndConfirm(admin: Agent, matchId: string, sets: Sets) {
    await admin.post(`/v1/admin/matches/${matchId}/results`).send({ sets }).expect(200);
    await admin.post(`/v1/admin/matches/${matchId}/results/confirm`).send({}).expect(200);
  }

  it('scores, breaks ties by set scores, splits shared places exactly and pays out once', async () => {
    const setup = await openContest(t);
    const finance = await adminClient(t, 'finance');

    // Ada: exact match 1, one point off in match 2. Bayo: one point off in match 1, exact match 2.
    // Same points, same closeness, same exact count: a true tie for 1st and 2nd.
    const ada = await playerWithPicks(setup, '+2348031234567', 'Ada', [
      RESULT_1,
      [{ home: 21, away: 25 }, ...RESULT_2.slice(1)],
    ]);
    const bayo = await playerWithPicks(setup, '+2348061234567', 'Bayo', [
      [{ home: 25, away: 21 }, ...RESULT_1.slice(1)],
      RESULT_2,
    ]);
    const chidi = await playerWithPicks(setup, '+2348131234567', 'Chidi', [
      [
        { home: 25, away: 10 },
        { home: 25, away: 10 },
        { home: 25, away: 10 },
      ],
      [
        { home: 25, away: 10 },
        { home: 25, away: 10 },
        { home: 25, away: 10 },
      ],
    ]);
    for (const player of [ada, bayo, chidi]) await confirmPayment(finance, player.entryId);

    await setup.admin.post(`/v1/admin/days/${setup.dayId}/close`).send({}).expect(200);
    await enterAndConfirm(setup.admin, setup.matchIds[0]!, RESULT_1);
    await enterAndConfirm(setup.admin, setup.matchIds[1]!, RESULT_2);

    const provisional = await t.raw().get(`/v1/public/days/${setup.date}/leaderboard`).expect(200);
    expect(provisional.body.final).toBe(false);
    expect(
      provisional.body.rows.map((r: { displayName: string; rank: number; points: number }) => [
        r.displayName,
        r.rank,
        r.points,
      ]),
    ).toEqual([
      ['Ada', 1, 14],
      ['Bayo', 1, 14],
      ['Chidi', 3, 3],
    ]);

    // Operations can't finalize; super admins can.
    const ops = await adminClient(t, 'operations');
    await ops.post(`/v1/admin/days/${setup.dayId}/finalize`).send({}).expect(403);
    const final = await setup.admin
      .post(`/v1/admin/days/${setup.dayId}/finalize`)
      .send({ acknowledgeWarnings: true })
      .expect(200);
    // ₦1,500 in fees → ₦1,200 prize money → ₦120 to the jackpot → ₦1,080 for the day.
    // Three players share places 1–3 (40/20/12.5 rescaled): 59,586 / 29,793 / 18,621 kobo.
    // Ada and Bayo share 1st + 2nd (89,379) → 44,689 each, 1 kobo to operations.
    const prizes = Object.fromEntries(
      final.body.rows.map((r: { displayName: string; prizeKobo: number }) => [
        r.displayName,
        r.prizeKobo,
      ]),
    );
    expect(prizes).toEqual({ Ada: 44_689, Bayo: 44_689, Chidi: 18_621 });
    expect(final.body.allocation).toMatchObject({
      dailyPoolKobo: 108_000,
      roundingKobo: 1,
      jackpotCutKobo: 12_000,
    });

    // Money in = money accounted for, to the kobo.
    const ledger = await ledgerTotals(t.db, setup.dayId);
    expect(ledger).toMatchObject({
      collections: 150_000,
      prizes_awarded: 107_999,
      jackpot_cut: 12_000,
      operations: 30_001,
    });

    // The jackpot now holds the day's share.
    const home = await t.raw().get('/v1/public/home').expect(200);
    expect(home.body.jackpot.guaranteedKobo).toBe(12_000);

    // Ada adds bank details; finance pays her exactly once.
    await ada.player
      .put('/v1/me/payout-account')
      .send({ bankCode: '058', accountNumber: '0123456789', accountName: 'Ada Obi' })
      .expect(200);
    const mine = await ada.player.get('/v1/me/obligations').expect(200);
    expect(mine.body.items[0]).toMatchObject({
      kind: 'prize',
      status: 'ready',
      amountKobo: 44_689,
    });
    const obligationId = mine.body.items[0].id as string;

    await finance
      .post(`/v1/admin/obligations/${obligationId}/start`)
      .send({ nameEnquiryName: 'ADA OBI' })
      .expect(200);
    const wrong = await finance
      .post(`/v1/admin/obligations/${obligationId}/paid`)
      .send({ transferReference: 'TRF-1', amountKobo: 44_000 });
    expect(wrong.body.code).toBe('AMOUNT_MISMATCH');
    await finance
      .post(`/v1/admin/obligations/${obligationId}/paid`)
      .send({ transferReference: 'TRF-1', amountKobo: 44_689 })
      .expect(200);
    // Same request again: no-op. A different reference: refused.
    await finance
      .post(`/v1/admin/obligations/${obligationId}/paid`)
      .send({ transferReference: 'TRF-1', amountKobo: 44_689 })
      .expect(200);
    const again = await finance
      .post(`/v1/admin/obligations/${obligationId}/paid`)
      .send({ transferReference: 'TRF-2', amountKobo: 44_689 });
    expect(again.body.code).toBe('BAD_STATUS');
    expect((await ledgerTotals(t.db, setup.dayId)).payouts_paid).toBe(44_689);

    // Changing bank details later is delayed by 24 hours (and texted).
    const change = await ada.player
      .put('/v1/me/payout-account')
      .send({ bankCode: '044', accountNumber: '9876543210', accountName: 'Ada Obi' })
      .expect(200);
    expect(change.body.current.last4).toBe('6789');
    expect(change.body.pending.last4).toBe('3210');

    // Bayo's details fail. His correction counts straight away (no 24-hour wait), and his
    // payout goes back to Ready with a note for finance.
    await bayo.player
      .put('/v1/me/payout-account')
      .send({ bankCode: '058', accountNumber: '1111111111', accountName: 'Bayo A' })
      .expect(200);
    const bayoOwed = (await bayo.player.get('/v1/me/obligations').expect(200)).body.items[0];
    expect(bayoOwed.status).toBe('ready');
    await finance
      .post(`/v1/admin/obligations/${bayoOwed.id}/invalid-details`)
      .send({ reason: 'Bank says the account number is wrong' })
      .expect(200);
    expect((await bayo.player.get('/v1/me/obligations').expect(200)).body.items[0].status).toBe(
      'details_invalid',
    );

    const fixed = await bayo.player
      .put('/v1/me/payout-account')
      .send({ bankCode: '058', accountNumber: '2222222222', accountName: 'Bayo A' })
      .expect(200);
    expect(fixed.body.current.last4).toBe('2222');
    expect(fixed.body.pending).toBeNull();
    const ready = await finance.get(`/v1/admin/obligations?status=ready`).expect(200);
    const corrected = ready.body.items.find((item: { id: string }) => item.id === bayoOwed.id);
    expect(corrected.account.last4).toBe('2222');
    expect(corrected.statusNote).toMatch(/new bank details/);
    await finance
      .post(`/v1/admin/obligations/${bayoOwed.id}/start`)
      .send({ nameEnquiryName: 'BAYO A' })
      .expect(200);
    const notice = await t.db.execute<{ content: { paragraphs: string[] } }>(sql`
      select content from email_messages where purpose = 'payout_account_changed'
      order by created_at desc limit 1
    `);
    expect(notice.rows[0]!.content.paragraphs[0]).toMatch(/straight away/);

    // Payouts have started, so the day can't be reopened.
    const reopen = await setup.admin
      .post(`/v1/admin/days/${setup.dayId}/reopen`)
      .send({ reason: 'Typo' });
    expect(reopen.body.code).toBe('PAYOUTS_STARTED');
  });

  it("doesn't count picks for matches that started before the money arrived", async () => {
    const setup = await openContest(t);
    const finance = await adminClient(t, 'finance');
    const late = await playerWithPicks(setup, '+2348031234567', 'Late Payer', [RESULT_1, RESULT_2]);

    // Match 1 kicks off early; its picks lock immediately.
    await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/started`)
      .send({ startedAt: new Date(Date.now() - 60_000).toISOString(), reason: 'Started early' })
      .expect(200);
    const blocked = await late.player
      .put(`/v1/me/days/${setup.date}/predictions`)
      .send({ date: setup.date, predictions: [{ matchId: setup.matchIds[0], sets: RESULT_2 }] })
      .expect(200);
    expect(blocked.body.rejected[0]).toMatchObject({ reason: 'LOCKED' });

    // The money reaches us now: after match 1 locked, before match 2.
    await confirmPayment(finance, late.entryId, new Date());
    await setup.admin.post(`/v1/admin/days/${setup.dayId}/close`).send({}).expect(200);
    await enterAndConfirm(setup.admin, setup.matchIds[0]!, RESULT_1);
    await enterAndConfirm(setup.admin, setup.matchIds[1]!, RESULT_2);

    const standing = await late.player.get(`/v1/me/days/${setup.date}/standing`).expect(200);
    expect(standing.body.row.points).toBe(7); // only match 2 counts
    const day = await late.player.get(`/v1/me/days/${setup.date}`).expect(200);
    const counts = Object.fromEntries(
      day.body.predictions.map((p: { matchId: string; counts: boolean }) => [p.matchId, p.counts]),
    );
    expect(counts).toEqual({ [setup.matchIds[0]!]: false, [setup.matchIds[1]!]: true });
  });

  it('reopens picks for a postponed match that never started, and only for one', async () => {
    const setup = await openContest(t);
    const finance = await adminClient(t, 'finance');
    const [postponed, other] = setup.matchIds as [string, string];
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

    // The match's original start passed before staff moved it, so the reschedule kept the lock.
    await t.db
      .update(matches)
      .set({ lockedAt: minutesAgo(1) })
      .where(eq(matches.id, postponed));
    const player = await t.player('+2348031234567', 'Patient Player');
    const save = () =>
      player
        .put(`/v1/me/days/${setup.date}/predictions`)
        .send({ date: setup.date, predictions: [{ matchId: postponed, sets: RESULT_1 }] })
        .expect(200);
    expect((await save()).body.rejected[0]).toMatchObject({ reason: 'LOCKED' });

    const reopened = await setup.admin
      .post(`/v1/admin/matches/${postponed}/reopen`)
      .send({ reason: 'Postponed to later today' })
      .expect(200);
    const view = reopened.body.matches.find((match: { id: string }) => match.id === postponed);
    expect(view.locked).toBe(false);
    expect((await save()).body.rejected).toEqual([]);

    // Money that arrives before the new start counts for the match again.
    const mine = await player.get(`/v1/me/days/${setup.date}`).expect(200);
    await confirmPayment(finance, mine.body.entry.id);
    const after = await player.get(`/v1/me/days/${setup.date}`).expect(200);
    expect(after.body.predictions).toEqual([
      expect.objectContaining({ matchId: postponed, counts: true }),
    ]);
    const audit = await t.db.select().from(auditLogs).where(eq(auditLogs.action, 'match.reopened'));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.reason).toBe('Postponed to later today');

    // A match that actually started stays locked.
    await setup.admin
      .post(`/v1/admin/matches/${other}/started`)
      .send({ startedAt: minutesAgo(1).toISOString(), reason: 'Started early' })
      .expect(200);
    const started = await setup.admin
      .post(`/v1/admin/matches/${other}/reopen`)
      .send({ reason: 'Oops' });
    expect(started.body.code).toBe('NOT_REOPENABLE');

    // So does one whose start time has passed: it has to be rescheduled first.
    await t.db
      .update(matches)
      .set({ scheduledAt: minutesAgo(1), lockedAt: minutesAgo(5) })
      .where(eq(matches.id, postponed));
    const passed = await setup.admin
      .post(`/v1/admin/matches/${postponed}/reopen`)
      .send({ reason: 'Oops' });
    expect(passed.body.code).toBe('NOT_REOPENABLE');
  });

  it('rejects invalid picks and keeps identical re-saves from creating revisions', async () => {
    const setup = await openContest(t);
    const player = await t.player();
    const bad = await player
      .put(`/v1/me/days/${setup.date}/predictions`)
      .send({
        date: setup.date,
        predictions: [
          {
            matchId: setup.matchIds[0],
            sets: [
              { home: 25, away: 24 },
              { home: 25, away: 20 },
              { home: 25, away: 20 },
            ],
          },
        ],
      })
      .expect(200);
    expect(bad.body.rejected[0]).toMatchObject({ reason: 'INVALID' });

    const body = {
      date: setup.date,
      predictions: [{ matchId: setup.matchIds[0], sets: RESULT_1 }],
    };
    const first = await player.put(`/v1/me/days/${setup.date}/predictions`).send(body).expect(200);
    const second = await player.put(`/v1/me/days/${setup.date}/predictions`).send(body).expect(200);
    expect(first.body.saved[0].changed).toBe(true);
    expect(second.body.saved[0]).toMatchObject({
      changed: false,
      savedAt: first.body.saved[0].savedAt,
    });
    const revisions = await t.db.execute<{ n: number }>(
      sql`select count(*)::int as n from prediction_revisions`,
    );
    expect(revisions.rows[0]!.n).toBe(1);
  });

  it('only super admins correct a confirmed result, and the leaderboard follows', async () => {
    const setup = await openContest(t, { times: ['16:00'] });
    const finance = await adminClient(t, 'finance');
    const p = await t.player();
    await p
      .put(`/v1/me/days/${setup.date}/predictions`)
      .send({ date: setup.date, predictions: [{ matchId: setup.matchIds[0], sets: RESULT_1 }] })
      .expect(200);
    const mine = await p.get(`/v1/me/days/${setup.date}`).expect(200);
    const player = { player: p, entryId: mine.body.entry.id as string };
    await confirmPayment(finance, player.entryId);
    await setup.admin.post(`/v1/admin/days/${setup.dayId}/close`).send({}).expect(200);
    await enterAndConfirm(setup.admin, setup.matchIds[0]!, RESULT_1);
    let standing = await player.player.get(`/v1/me/days/${setup.date}/standing`).expect(200);
    expect(standing.body.row.points).toBe(7);

    const ops = await adminClient(t, 'operations');
    await ops
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results`)
      .send({ sets: RESULT_2, correctionReason: 'Wrong match' })
      .expect(403);
    const noReason = await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results`)
      .send({ sets: RESULT_2 });
    expect(noReason.body.code).toBe('CORRECTION_NEEDS_REASON');
    await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results`)
      .send({ sets: RESULT_2, correctionReason: 'Entered the wrong score' })
      .expect(200);
    // Still the old result until the correction is confirmed.
    standing = await player.player.get(`/v1/me/days/${setup.date}/standing`).expect(200);
    expect(standing.body.row.points).toBe(7);
    await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results/confirm`)
      .send({})
      .expect(200);
    standing = await player.player.get(`/v1/me/days/${setup.date}/standing`).expect(200);
    expect(standing.body.row.points).toBe(0);
  });

  it('reopens a final day before payouts and finalizes it again cleanly', async () => {
    const setup = await openContest(t, { times: ['16:00'] });
    const finance = await adminClient(t, 'finance');
    const player = await t.player();
    await player
      .put(`/v1/me/days/${setup.date}/predictions`)
      .send({ date: setup.date, predictions: [{ matchId: setup.matchIds[0], sets: RESULT_1 }] })
      .expect(200);
    const [entry] = await t.db.select().from(entries);
    await confirmPayment(finance, entry!.id);
    await setup.admin.post(`/v1/admin/days/${setup.dayId}/close`).send({}).expect(200);
    await enterAndConfirm(setup.admin, setup.matchIds[0]!, RESULT_1);
    await setup.admin
      .post(`/v1/admin/days/${setup.dayId}/finalize`)
      .send({ acknowledgeWarnings: true })
      .expect(200);

    const reopened = await setup.admin
      .post(`/v1/admin/days/${setup.dayId}/reopen`)
      .send({ reason: 'Result was wrong' })
      .expect(200);
    expect(reopened.body.day.status).toBe('closed');
    const live = await t.db
      .select()
      .from(payoutObligations)
      .where(sql`${payoutObligations.supersededAt} is null`);
    expect(live).toHaveLength(0);
    // The reversal nets the finalization out to zero.
    const totals = await ledgerTotals(t.db, setup.dayId);
    expect(totals).toMatchObject({
      prizes_awarded: 0,
      jackpot_cut: 0,
      operations: 0,
      collections: 50_000,
    });

    await setup.admin
      .post(`/v1/admin/days/${setup.dayId}/finalize`)
      .send({ acknowledgeWarnings: true })
      .expect(200);
    const again = await t.db
      .select()
      .from(payoutObligations)
      .where(sql`${payoutObligations.supersededAt} is null`);
    expect(again).toHaveLength(1);
  });

  it('cancelling a day refunds every paid player in full', async () => {
    const setup = await openContest(t);
    const finance = await adminClient(t, 'finance');
    const paid = await playerWithPicks(setup, '+2348031234567', 'Ada', [RESULT_1, RESULT_2]);
    await t.player('+2348061234567', 'Bayo'); // signed up, never joined
    await confirmPayment(finance, paid.entryId);
    await finance
      .post('/v1/admin/contributions')
      .send({
        source: 'sponsor',
        dayId: setup.dayId,
        amountKobo: 100_000,
        sponsorName: 'Acme',
        received: true,
      })
      .expect(200);

    await setup.admin
      .post(`/v1/admin/days/${setup.dayId}/cancel`)
      .send({ reason: 'Venue flooded' })
      .expect(200);
    const obligations = await paid.player.get('/v1/me/obligations').expect(200);
    expect(obligations.body.items).toEqual([
      expect.objectContaining({ kind: 'refund', amountKobo: 50_000, status: 'awaiting_details' }),
    ]);
    const totals = await ledgerTotals(t.db, setup.dayId);
    expect(totals).toMatchObject({ refunds_owed: 50_000, contributions: 0 });
  });
});

describe('the league jackpot', () => {
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

  it('ranks predicted tables against the final standings; earliest submission wins a tie', async () => {
    const setup = await openContest(t);
    const [a, b, c, d] = setup.teamIds as [string, string, string, string];
    const finance = await adminClient(t, 'finance');

    const ada = await t.player('+2348031234567', 'Ada');
    const bayo = await t.player('+2348061234567', 'Bayo');
    const chidi = await t.player('+2348131234567', 'Chidi');

    const bad = await ada.post('/v1/me/jackpot').send({ orders: { men: [a, b, c], women: [] } });
    expect(bad.body.code).toBe('BAD_ORDER');
    expect((await ada.get('/v1/me/jackpot').expect(200)).body.canSubmit).toBe(true);

    // Ada and Bayo predict the same table; Ada submits first. Chidi is perfect but never pays.
    await ada
      .post('/v1/me/jackpot')
      .send({ orders: { men: [b, a, c, d], women: [] } })
      .expect(200);
    const first = await ada.get('/v1/me/jackpot').expect(200);
    expect(first.body).toMatchObject({ canSubmit: false, orders: { men: [b, a, c, d] } });

    // A retry of the same prediction is harmless; a different one is refused.
    await ada
      .post('/v1/me/jackpot')
      .send({ orders: { men: [b, a, c, d], women: [] } })
      .expect(200);
    const change = await ada
      .post('/v1/me/jackpot')
      .send({ orders: { men: [a, b, c, d], women: [] } });
    expect(change.body.code).toBe('ALREADY_SUBMITTED');
    const after = await ada.get('/v1/me/jackpot').expect(200);
    expect(after.body.submittedAt).toBe(first.body.submittedAt);
    expect(after.body.orders.men).toEqual([b, a, c, d]);

    // Not even a direct database write can change or remove a submitted prediction.
    const reason = (error: unknown) => {
      const failure = error as { message?: string; cause?: { message?: string } };
      return `${failure.message} ${failure.cause?.message ?? ''}`;
    };
    expect(
      await t.db.execute(sql`update jackpot_entries set orders = '{}'::jsonb`).catch(reason),
    ).toMatch(/append-only/);
    expect(await t.db.execute(sql`delete from jackpot_entries`).catch(reason)).toMatch(
      /append-only/,
    );

    await bayo
      .post('/v1/me/jackpot')
      .send({ orders: { men: [b, a, c, d], women: [] } })
      .expect(200);
    await chidi
      .post('/v1/me/jackpot')
      .send({ orders: { men: [a, b, c, d], women: [] } })
      .expect(200);

    // Ada and Bayo each have a paid daily entry (with picks); Chidi doesn't, so can't win.
    for (const player of [ada, bayo]) {
      await player
        .put(`/v1/me/days/${setup.date}/predictions`)
        .send({ date: setup.date, predictions: [{ matchId: setup.matchIds[0], sets: RESULT_1 }] })
        .expect(200);
      const mine = await player.get(`/v1/me/days/${setup.date}`).expect(200);
      await finance
        .post(`/v1/admin/entries/${mine.body.entry.id}/confirm`)
        .send({ transfer: transfer() })
        .expect(200);
    }
    expect((await ada.get('/v1/me/jackpot').expect(200)).body.eligible).toBe(true);
    expect((await chidi.get('/v1/me/jackpot').expect(200)).body.eligible).toBe(false);

    await finance
      .post('/v1/admin/contributions')
      .send({
        source: 'sponsor',
        jackpotId: (await t.db.execute<{ id: string }>(sql`select id from jackpots`)).rows[0]!.id,
        amountKobo: 1_000_000,
        sponsorName: 'Acme',
        received: true,
      })
      .expect(200);

    // Close entries, wrap the league up and settle.
    await t.db.execute(
      sql`update jackpots set entry_closes_at = now() - interval '1 minute', status = 'closed'`,
    );
    const blocked = await setup.admin
      .post(`/v1/admin/leagues/${setup.leagueId}/jackpot/settle`)
      .send({});
    expect(blocked.body.code).toBe('NOT_READY');

    // Play the day out: close, results, finalize (its jackpot share joins the pot).
    await setup.admin.post(`/v1/admin/days/${setup.dayId}/close`).send({}).expect(200);
    for (const [matchId, sets] of [
      [setup.matchIds[0]!, RESULT_1],
      [setup.matchIds[1]!, RESULT_2],
    ] as const) {
      await setup.admin.post(`/v1/admin/matches/${matchId}/results`).send({ sets }).expect(200);
      await setup.admin.post(`/v1/admin/matches/${matchId}/results/confirm`).send({}).expect(200);
    }
    await setup.admin
      .post(`/v1/admin/days/${setup.dayId}/finalize`)
      .send({ acknowledgeWarnings: true })
      .expect(200);
    await setup.admin
      .put(`/v1/admin/leagues/${setup.leagueId}/standings`)
      .send({
        category: 'men',
        rows: [a, b, c, d].map((teamId) => ({
          teamId,
          played: 3,
          lost: 1,
          setsWon: 6,
          setsLost: 4,
          points: 6,
        })),
      })
      .expect(200);
    await setup.admin
      .post(`/v1/admin/leagues/${setup.leagueId}/standings/finalize`)
      .send({})
      .expect(200);

    const settled = await setup.admin
      .post(`/v1/admin/leagues/${setup.leagueId}/jackpot/settle`)
      .send({})
      .expect(200);
    // 2 entries × ₦500 × 80% × 10% = ₦80 from the day, plus the sponsor's ₦10,000.
    expect(settled.body.winner).toMatchObject({
      displayName: 'Ada',
      distance: 2,
      amountKobo: 1_008_000,
    });
    expect(settled.body.preview.map((p: { displayName: string }) => p.displayName)).toEqual([
      'Ada',
      'Bayo',
    ]);

    const owed = await ada.get('/v1/me/obligations').expect(200);
    expect(owed.body.items.find((o: { kind: string }) => o.kind === 'jackpot')).toMatchObject({
      amountKobo: 1_008_000,
    });
    const view = await t.raw().get('/v1/public/jackpot').expect(200);
    expect(view.body.winner.displayName).toBe('Ada');
    expect(await t.db.select().from(jackpotEntries)).toHaveLength(3);
  });
});
