import { auditLogs, matchDays, sql } from '@predict/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminClient } from './support/admin';
import { COLLECTION_ACCOUNT, openContest, watDay } from './support/contest';
import { createTestApp, type TestApp } from './support/test-app';

describe('contest setup (teams, leagues, days, fixtures)', () => {
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

  it('creates teams per category and refuses duplicates in the same category', async () => {
    const admin = await adminClient(t, 'operations');
    await admin
      .post('/v1/admin/teams')
      .send({ name: 'Kano Pillars', shortName: 'KAN', category: 'men' })
      .expect(200);
    // Same club name in the other category is fine.
    await admin
      .post('/v1/admin/teams')
      .send({ name: 'Kano Pillars', shortName: 'KAN', category: 'women' })
      .expect(200);
    const dup = await admin
      .post('/v1/admin/teams')
      .send({ name: 'kano pillars', shortName: 'KP', category: 'men' });
    expect(dup.body.code).toBe('TEAM_EXISTS');
    const list = await admin.get('/v1/admin/teams?category=women').expect(200);
    expect(list.body.items).toHaveLength(1);

    // Query flags: the string "false" must mean false.
    await admin
      .patch(`/v1/admin/teams/${list.body.items[0].id}`)
      .send({ archived: true })
      .expect(200);
    const visible = await admin.get('/v1/admin/teams?includeArchived=false').expect(200);
    const all = await admin.get('/v1/admin/teams?includeArchived=true').expect(200);
    expect(visible.body.items).toHaveLength(1);
    expect(all.body.items).toHaveLength(2);
  });

  it('opens a day only when it is ready, then freezes its settings', async () => {
    const { admin, dayId } = await openContest(t, { open: false });
    // Ready: open it.
    const opened = await admin.post(`/v1/admin/days/${dayId}/open`).send({}).expect(200);
    expect(opened.body.status).toBe('open');
    expect(opened.body.config.minScoredMatches).toBe(1); // half of 2 matches, rounded up

    const change = await admin
      .patch(`/v1/admin/days/${dayId}`)
      .send({ config: { ...opened.body.config, entryFeeKobo: 100_000 } });
    expect(change.body.code).toBe('DAY_LOCKED');

    // Even a direct database write can't change frozen settings.
    await expect(
      t.db
        .update(matchDays)
        .set({ entryFeeKobo: 1 })
        .where(sql`${matchDays.id} = ${dayId}`),
    ).rejects.toThrow();

    const audit = await t.db.select().from(auditLogs);
    expect(audit.map((row) => row.action)).toContain('day.opened');
  });

  it('lists what blocks a day from opening', async () => {
    const admin = await adminClient(t, 'super_admin');
    const league = await admin
      .post('/v1/admin/leagues')
      .send({
        name: 'Blocked',
        startDate: watDay(0),
        endDate: watDay(5),
        jackpotEntryClosesOn: watDay(2),
        jackpotEntryClosesAt: '12:00',
      })
      .expect(200);
    await admin
      .post(`/v1/admin/leagues/${league.body.id}/days`)
      .send({ dates: [watDay(1)] })
      .expect(200);
    const days = await admin.get(`/v1/admin/days?leagueId=${league.body.id}`).expect(200);
    const day = await admin.get(`/v1/admin/days/${days.body.items[0].id}`).expect(200);
    expect(day.body.openBlockers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Start the league/),
        expect.stringMatching(/at least one match/),
        expect.stringMatching(/bank account/),
      ]),
    );
    const res = await admin.post(`/v1/admin/days/${days.body.items[0].id}/open`).send({});
    expect(res.body.code).toBe('NOT_READY');
  });

  it('imports fixtures from CSV: preview first, then commit', async () => {
    const admin = await adminClient(t, 'super_admin');
    for (const [name, shortName, category] of [
      ['Kano Pillars', 'KAN', 'men'],
      ['Nigeria Customs', 'CUS', 'men'],
      ['Kano Pillars', 'KAN', 'women'],
      ['Nigeria Customs', 'CUS', 'women'],
    ] as const) {
      await admin.post('/v1/admin/teams').send({ name, shortName, category }).expect(200);
    }
    const league = await admin
      .post('/v1/admin/leagues')
      .send({
        name: 'CSV League',
        startDate: watDay(0),
        endDate: watDay(10),
        jackpotEntryClosesOn: watDay(2),
        jackpotEntryClosesAt: '12:00',
      })
      .expect(200);
    const [y, m, d] = watDay(2).split('-');
    const csv = [
      'date,time,category,home,away,venue',
      `${watDay(1)},16:00,men,Kano Pillars,CUS,Abuja`,
      `${d}/${m}/${y},4:30 pm,women,kano pillars,Nigeria Customs,`,
      `${watDay(1)},18:00,,Kano Pillars,Nigeria Customs,`,
      `${watDay(1)},25:00,men,Nobody FC,CUS,`,
    ].join('\n');

    const preview = await admin
      .post(`/v1/admin/leagues/${league.body.id}/fixtures/import`)
      .send({ csv, commit: false })
      .expect(200);
    expect(preview.body.valid).toBe(false);
    expect(preview.body.rows[0].error).toBeNull();
    expect(preview.body.rows[1]).toMatchObject({ time: '16:30', category: 'women', error: null });
    expect(preview.body.rows[2].error).toMatch(/both categories/);
    expect(preview.body.rows[3].error).toMatch(/not a time/);

    const good = csv.split('\n').slice(0, 3).join('\n');
    const commit = await admin
      .post(`/v1/admin/leagues/${league.body.id}/fixtures/import`)
      .send({ csv: good, commit: true })
      .expect(200);
    expect(commit.body).toMatchObject({ valid: true, committed: true });
    expect(commit.body.newDays).toEqual([watDay(1), watDay(2)]);

    const view = await admin.get(`/v1/admin/leagues/${league.body.id}`).expect(200);
    expect(view.body.days).toHaveLength(2);
    // Teams were added to the (draft) league automatically.
    expect(view.body.teams).toHaveLength(4);
  });

  it('moves the jackpot deadline either way after players enter, and closes or reopens it', async () => {
    const { admin, leagueId, teamIds } = await openContest(t);
    const player = await t.player();
    const save = (men: string[]) =>
      player.post('/v1/me/jackpot').send({ orders: { men, women: [] } });
    await save(teamIds).expect(200);

    const setClose = (date: string) =>
      admin
        .put(`/v1/admin/leagues/${leagueId}/jackpot-close`)
        .send({ date, time: '10:00' })
        .expect(200);
    // Later, then earlier: both fine with an entry in (10:00 Lagos is 09:00 UTC).
    for (const date of [watDay(6), watDay(2)]) {
      const res = await setClose(date);
      expect(res.body.jackpot).toMatchObject({
        status: 'open',
        entryClosesAt: `${date}T09:00:00.000Z`,
      });
    }

    // A time that has passed closes entries now (never before saves already made).
    const closed = await setClose(watDay(-1));
    expect(closed.body.jackpot.status).toBe('closed');
    expect(Date.parse(closed.body.jackpot.entryClosesAt)).toBeGreaterThan(Date.now() - 60_000);
    expect((await save([...teamIds].reverse())).body.code).toBe('JACKPOT_CLOSED');

    // A later time reopens them, and the player can change their tables again.
    expect((await setClose(watDay(3))).body.jackpot.status).toBe('open');
    await save([...teamIds].reverse()).expect(200);
  });

  it('enforces roles', async () => {
    const { dayId } = await openContest(t, { open: false });
    const ops = await adminClient(t, 'operations');
    const finance = await adminClient(t, 'finance');
    await ops.post(`/v1/admin/days/${dayId}/open`).send({}).expect(403);
    await finance
      .post('/v1/admin/teams')
      .send({ name: 'X', shortName: 'XX', category: 'men' })
      .expect(403);
    await ops
      .patch('/v1/admin/settings')
      .send({ collectionAccount: COLLECTION_ACCOUNT })
      .expect(403);
    await ops.get('/v1/admin/payments/queue').expect(403);
  });
});

describe('public pages', () => {
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

  it('shows the featured day with fixtures, live pool and rules; hides drafts', async () => {
    const { date, admin, leagueId } = await openContest(t);
    await admin
      .post(`/v1/admin/leagues/${leagueId}/days`)
      .send({ dates: [watDay(2)] })
      .expect(200);

    const home = await t.raw().get('/v1/public/home').expect(200);
    expect(home.body.leagueName).toBe('Test League');
    expect(home.body.featured.date).toBe(date);
    expect(home.body.featured.matches).toHaveLength(2);
    expect(home.body.featured.pool).toMatchObject({ confirmedEntries: 0, dailyPoolKobo: 0 });
    // The draft day isn't public.
    expect(home.body.days.map((day: { date: string }) => day.date)).toEqual([date]);

    await t
      .raw()
      .get(`/v1/public/days/${watDay(2)}`)
      .expect(404);
    const rules = await t.raw().get(`/v1/public/rules?date=${date}`).expect(200);
    expect(rules.body.date).toBe(date);
    expect(JSON.stringify(rules.body.sections)).toContain('₦500');
  });

  it('publishes standings only when staff switch them on', async () => {
    const { admin, leagueId } = await openContest(t);
    const hidden = await t.raw().get('/v1/public/standings');
    expect(hidden.body.code).toBe('NOT_PUBLISHED');
    await admin.patch(`/v1/admin/leagues/${leagueId}`).send({ standingsPublic: true }).expect(200);
    const shown = await t.raw().get('/v1/public/standings').expect(200);
    expect(shown.body.tables[0].rows).toHaveLength(4);
    expect(shown.body.tables[0].rows[0]).not.toHaveProperty('phone');
  });
});
