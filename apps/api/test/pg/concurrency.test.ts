import { entries, ledgerEntries, matchDays, sql } from '@predict/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminClient } from '../support/admin';
import { ENTRY_FEE_KOBO, openContest, transfer } from '../support/contest';
import { createTestApp, type TestApp } from '../support/test-app';

// Races that only a real, multi-connection Postgres can reproduce (PGlite serialises
// everything). Runs with `pnpm test:pg` when TEST_DATABASE_URL points at a disposable database.
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('concurrency on real Postgres', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ databaseUrl });
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.reset();
  });

  it('confirming one entry 20 times in parallel books the fee once', async () => {
    const setup = await openContest(t);
    const player = await t.player();
    const entry = await player.post(`/v1/me/days/${setup.date}/join`).send({}).expect(200);
    const finance = await adminClient(t, 'finance');
    const body = { transfer: transfer({ bankReference: 'SAME-1' }) };

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        finance.post(`/v1/admin/entries/${entry.body.id}/confirm`).send(body),
      ),
    );
    expect(results.every((res) => res.status === 200)).toBe(true);
    const ledger = await t.db.select().from(ledgerEntries);
    expect(ledger.filter((row) => row.account === 'collections')).toHaveLength(1);
  });

  it('one transfer raced across many entries pays for exactly one', async () => {
    const setup = await openContest(t);
    const finance = await adminClient(t, 'finance');
    const entryIds: string[] = [];
    for (let i = 0; i < 8; i++) {
      const player = await t.player(`+23480312345${10 + i}`, `Player ${i}`);
      const entry = await player.post(`/v1/me/days/${setup.date}/join`).send({}).expect(200);
      entryIds.push(entry.body.id);
    }
    const body = { transfer: transfer({ bankReference: 'ONE-FOR-ALL' }) };
    const results = await Promise.all(
      entryIds.map((id) => finance.post(`/v1/admin/entries/${id}/confirm`).send(body)),
    );
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(results.filter((res) => res.body.code === 'INSUFFICIENT_FUNDS')).toHaveLength(7);
    const confirmed = await t.db
      .select()
      .from(entries)
      .where(sql`${entries.status} = 'confirmed'`);
    expect(confirmed).toHaveLength(1);
  });

  it('finalizing while payments are being confirmed never loses or double-counts an entry', async () => {
    const setup = await openContest(t, { times: ['16:00'] });
    const finance = await adminClient(t, 'finance');
    const sets = [
      { home: 25, away: 20 },
      { home: 25, away: 20 },
      { home: 25, away: 20 },
    ];
    const entryIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const player = await t.player(`+23480612345${10 + i}`, `Racer ${i}`);
      await player
        .put(`/v1/me/days/${setup.date}/predictions`)
        .send({ date: setup.date, predictions: [{ matchId: setup.matchIds[0], sets }] })
        .expect(200);
      const mine = await player.get(`/v1/me/days/${setup.date}`).expect(200);
      entryIds.push(mine.body.entry.id);
    }
    // Two confirmed up front so the day can be finalized at all.
    for (const id of entryIds.slice(0, 2)) {
      await finance
        .post(`/v1/admin/entries/${id}/confirm`)
        .send({ transfer: transfer() })
        .expect(200);
    }
    await setup.admin.post(`/v1/admin/days/${setup.dayId}/close`).send({}).expect(200);
    await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results`)
      .send({ sets })
      .expect(200);
    await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results/confirm`)
      .send({})
      .expect(200);

    const racing = entryIds
      .slice(2)
      .map((id) => finance.post(`/v1/admin/entries/${id}/confirm`).send({ transfer: transfer() }));
    const finalize = setup.admin
      .post(`/v1/admin/days/${setup.dayId}/finalize`)
      .send({ acknowledgeWarnings: true });
    await Promise.all([...racing, finalize]);

    const [day] = await t.db
      .select()
      .from(matchDays)
      .where(sql`${matchDays.id} = ${setup.dayId}`);
    const confirmed = await t.db
      .select()
      .from(entries)
      .where(sql`${entries.matchDayId} = ${setup.dayId} and ${entries.status} = 'confirmed'`);
    // Every confirmation either landed before the freeze (and is counted) or was refused after it.
    expect(day!.status).toBe('finalized');
    expect(day!.finalConfirmedCount).toBe(confirmed.length);
    expect(day!.finalRevenueKobo).toBe(confirmed.length * ENTRY_FEE_KOBO);
  });

  it('a pick saved while the day closes only counts if it landed before the close', async () => {
    const setup = await openContest(t, { times: ['16:00'] });
    const finance = await adminClient(t, 'finance');
    const player = await t.player();
    const base = [
      { home: 25, away: 20 },
      { home: 25, away: 20 },
      { home: 25, away: 20 },
    ];
    // First pick and payment well before the close.
    await player
      .put(`/v1/me/days/${setup.date}/predictions`)
      .send({ date: setup.date, predictions: [{ matchId: setup.matchIds[0], sets: base }] })
      .expect(200);
    const mine = await player.get(`/v1/me/days/${setup.date}`).expect(200);
    await finance
      .post(`/v1/admin/entries/${mine.body.entry.id}/confirm`)
      .send({ transfer: transfer() })
      .expect(200);

    // Ten different edits race the close.
    const saves = Array.from({ length: 10 }, (_, i) =>
      player.put(`/v1/me/days/${setup.date}/predictions`).send({
        date: setup.date,
        predictions: [
          { matchId: setup.matchIds[0], sets: base.map((set) => ({ ...set, away: 10 + i })) },
        ],
      }),
    );
    const close = setup.admin.post(`/v1/admin/days/${setup.dayId}/close`).send({});
    await Promise.all([...saves, close]);

    // The result equals the last version saved before the close: an exact score only if the
    // scorer used exactly that version (every version has different set scores).
    const [day] = await t.db
      .select()
      .from(matchDays)
      .where(sql`${matchDays.id} = ${setup.dayId}`);
    const latest = await t.db.execute<{ sets: Array<{ home: number; away: number }> }>(sql`
      select sets from prediction_revisions
      where saved_at < ${day!.closedAt!.toISOString()}
      order by saved_at desc limit 1
    `);
    const sets = latest.rows[0]!.sets;
    await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results`)
      .send({ sets })
      .expect(200);
    await setup.admin
      .post(`/v1/admin/matches/${setup.matchIds[0]}/results/confirm`)
      .send({})
      .expect(200);
    const standing = await player.get(`/v1/me/days/${setup.date}/standing`).expect(200);
    expect(standing.body.row).toMatchObject({ points: 7, closeness: 0 });
  });
});
