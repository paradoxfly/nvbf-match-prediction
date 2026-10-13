import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminClient } from './support/admin';
import { openContest, transfer } from './support/contest';
import { createTestApp, type TestApp } from './support/test-app';

describe('staff tools', () => {
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

  it('flags players who share a payout bank account and lets a super admin suspend one', async () => {
    const boss = await adminClient(t, 'super_admin');
    const ada = await t.player('+2348031234567', 'Ada');
    const twin = await t.player('+2348061234567', 'Twin');
    for (const player of [ada, twin]) {
      await player
        .put('/v1/me/payout-account')
        .send({ bankCode: '058', accountNumber: '0123456789', accountName: 'Ada Obi' })
        .expect(200);
    }
    const flagged = await boss.get('/v1/admin/players?sharedAccountsOnly=true').expect(200);
    expect(flagged.body.total).toBe(2);
    expect(flagged.body.items[0].sharedAccountWith).toHaveLength(1);

    const search = await boss.get('/v1/admin/players?q=08061234567').expect(200);
    expect(search.body.items.map((p: { displayName: string }) => p.displayName)).toEqual(['Twin']);

    const twinId = search.body.items[0].id;
    await boss
      .post(`/v1/admin/players/${twinId}/status`)
      .send({ status: 'suspended', reason: 'Duplicate of Ada' })
      .expect(200);
    await twin.get('/v1/auth/session').expect(401);

    const audit = await boss.get(`/v1/admin/audit?targetType=user&targetId=${twinId}`).expect(200);
    expect(audit.body.items[0]).toMatchObject({
      action: 'player.suspended',
      reason: 'Duplicate of Ada',
    });
  });

  it('reconciles a finalized day to the kobo', async () => {
    const setup = await openContest(t, { times: ['16:00'] });
    const finance = await adminClient(t, 'finance');
    const sets = [
      { home: 25, away: 20 },
      { home: 25, away: 20 },
      { home: 25, away: 20 },
    ];
    for (const [phone, name] of [
      ['+2348031234567', 'Ada'],
      ['+2348061234567', 'Bayo'],
      ['+2348131234567', 'Chidi'],
    ] as const) {
      const player = await t.player(phone, name);
      await player
        .put(`/v1/me/days/${setup.date}/predictions`)
        .send({ date: setup.date, predictions: [{ matchId: setup.matchIds[0], sets }] })
        .expect(200);
      const mine = await player.get(`/v1/me/days/${setup.date}`).expect(200);
      await finance
        .post(`/v1/admin/entries/${mine.body.entry.id}/confirm`)
        .send({ transfer: transfer() })
        .expect(200);
    }
    // An overpayment that stays unused shows up separately.
    await finance
      .post('/v1/admin/bank-payments')
      .send(transfer({ amountKobo: 20_000 }))
      .expect(200);

    await setup.admin.post(`/v1/admin/days/${setup.dayId}/close`).send({}).expect(200);
    await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results`)
      .send({ sets })
      .expect(200);
    await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results/confirm`)
      .send({})
      .expect(200);
    await setup.admin
      .post(`/v1/admin/days/${setup.dayId}/finalize`)
      .send({ acknowledgeWarnings: true })
      .expect(200);

    const report = await finance.get('/v1/admin/reports/reconciliation').expect(200);
    const day = report.body.days.find((d: { dayId: string }) => d.dayId === setup.dayId);
    expect(day.balanced).toBe(true);
    expect(day.totals.collections).toBe(150_000);
    expect(day.outstandingKobo).toBe(day.totals.prizesAwarded);
    expect(report.body.transfers).toMatchObject({
      receivedKobo: 170_000,
      appliedKobo: 150_000,
      unappliedKobo: 20_000,
    });
  });
});
