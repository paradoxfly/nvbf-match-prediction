import {
  adminUsers,
  auditLogs,
  clearTables,
  entries,
  jackpotEntries,
  ledgerEntries,
  leagues,
  planReset,
  sessions,
  settings,
  teams,
  users,
} from '@predict/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './support/admin';
import { openContest, transfer } from './support/contest';
import { createTestApp, type TestApp } from './support/test-app';

describe('resetting contest data', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('clears everything but accounts, sessions and settings, and the app keeps working', async () => {
    const setup = await openContest(t);
    const player = await t.player();
    const mine = await player.post(`/v1/me/days/${setup.date}/join`).send({}).expect(200);
    const finance = await adminClient(t, 'finance');
    await finance
      .post(`/v1/admin/entries/${mine.body.id}/confirm`)
      .send({ transfer: transfer() })
      .expect(200);
    await player
      .post('/v1/me/jackpot')
      .send({ orders: { men: setup.teamIds, women: [] } })
      .expect(200);

    const counts = async () => ({
      users: (await t.db.select().from(users)).length,
      admins: (await t.db.select().from(adminUsers)).length,
      sessions: (await t.db.select().from(sessions)).length,
      settings: (await t.db.select().from(settings)).length,
      leagues: (await t.db.select().from(leagues)).length,
      teams: (await t.db.select().from(teams)).length,
      entries: (await t.db.select().from(entries)).length,
      jackpotEntries: (await t.db.select().from(jackpotEntries)).length,
      ledger: (await t.db.select().from(ledgerEntries)).length,
      audit: (await t.db.select().from(auditLogs)).length,
    });
    const before = await counts();
    expect(before).toMatchObject({ leagues: 1, teams: 4, entries: 1, jackpotEntries: 1 });
    expect(before.ledger).toBeGreaterThan(0);

    // Keeping teams but not their logos would leave teams pointing at nothing: refused.
    const partial = await planReset(t.db, ['teams']);
    expect(partial.conflicts).toContainEqual({ table: 'teams', references: 'media_assets' });
    await expect(clearTables(t.db, partial)).rejects.toThrow(/Refusing/);
    await expect(planReset(t.db, ['nope'])).rejects.toThrow(/No such table/);

    const plan = await planReset(t.db);
    expect(plan.keep.map((entry) => entry.table).sort()).toEqual([
      'admin_users',
      'sessions',
      'settings',
      'users',
    ]);
    expect(plan.clear.find((entry) => entry.table === 'leagues')?.rows).toBe(1);
    await clearTables(t.db, plan);

    // Append-only tables (ledger, audit, jackpot entries) are cleared too.
    expect(await counts()).toEqual({
      users: before.users,
      admins: before.admins,
      sessions: before.sessions,
      settings: before.settings,
      leagues: 0,
      teams: 0,
      entries: 0,
      jackpotEntries: 0,
      ledger: 0,
      audit: 0,
    });

    // Everyone stays signed in, and staff can set up a new league from scratch.
    await player.get('/v1/auth/session').expect(200);
    await setup.admin
      .post('/v1/admin/teams')
      .send({ name: 'Kano Pillars', shortName: 'KAN', category: 'men' })
      .expect(200);
    const home = await t.raw().get('/v1/public/home').expect(200);
    expect(home.body.featured).toBeNull();
  });
});
