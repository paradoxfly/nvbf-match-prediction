import { phoneOtps, sql, users } from '@predict/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/test-app';

const PHONE = '+2348031234567';

describe('player sign-in (phone + SMS code)', () => {
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

  it('normalises local formats and texts a code', async () => {
    const res = await t.client().post('/v1/auth/otp/request').send({ phone: '0803 123 4567' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: PHONE, expiresInSec: 300, resendAfterSec: 60 });
    expect(t.codeFor(PHONE)).toMatch(/^\d{6}$/);
    // With the console provider (local only) the code comes back for the screen to show.
    expect(res.body.devCode).toBe(t.codeFor(PHONE));
    // The code itself is never stored.
    const rows = await t.db.execute<{ body: string | null }>(sql`select body from sms_messages`);
    expect(rows.rows).toEqual([{ body: null }]);
  });

  it('rejects numbers that are not Nigerian mobiles', async () => {
    for (const phone of ['1234567', '+447911123456', 'not a number']) {
      const res = await t.client().post('/v1/auth/otp/request').send({ phone });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PHONE');
    }
  });

  it('signs up a new player in three steps and signs them back in later', async () => {
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    const verify = await agent
      .post('/v1/auth/otp/verify')
      .send({ phone: PHONE, code: t.codeFor(PHONE) })
      .expect(200);
    expect(verify.body.status).toBe('needs_profile');
    // No account exists until the profile is completed.
    expect((await t.db.select().from(users)).length).toBe(0);

    const done = await agent
      .post('/v1/auth/signup/complete')
      .send({
        signupTicket: verify.body.signupTicket,
        displayName: 'Ada Obi',
        acceptTerms: true,
        confirmAdult: true,
      })
      .expect(200);
    expect(done.body.user).toMatchObject({ phone: PHONE, displayName: 'Ada Obi' });
    await agent.get('/v1/auth/session').expect(200);

    // Next time the same number goes straight in.
    const other = t.client();
    await t.db.execute(sql`update phone_otps set created_at = now() - interval '2 minutes'`);
    await other.post('/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    const again = await other
      .post('/v1/auth/otp/verify')
      .send({ phone: PHONE, code: t.codeFor(PHONE) })
      .expect(200);
    expect(again.body).toMatchObject({ status: 'signed_in', user: { displayName: 'Ada Obi' } });
    await other.get('/v1/auth/session').expect(200);
  });

  it('requires 18+ and accepted terms, and unique display names', async () => {
    await t.player(PHONE, 'Taken Name');
    const agent = t.client();
    const phone = '+2348061234567';
    await agent.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const verify = await agent
      .post('/v1/auth/otp/verify')
      .send({ phone, code: t.codeFor(phone) })
      .expect(200);

    const minor = await agent.post('/v1/auth/signup/complete').send({
      signupTicket: verify.body.signupTicket,
      displayName: 'New Player',
      acceptTerms: true,
      confirmAdult: false,
    });
    expect(minor.status).toBe(400);

    const clash = await agent.post('/v1/auth/signup/complete').send({
      signupTicket: verify.body.signupTicket,
      displayName: 'taken name',
      acceptTerms: true,
      confirmAdult: true,
    });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('DISPLAY_NAME_TAKEN');
  });

  it('counts wrong codes and kills the code after 5 tries', async () => {
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    const good = t.codeFor(PHONE);
    const bad = good === '000000' ? '111111' : '000000';
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await agent.post('/v1/auth/otp/verify').send({ phone: PHONE, code: bad });
      expect(res.body.code).toBe('INVALID_CODE');
      expect(res.body.data.attemptsLeft).toBe(5 - attempt);
    }
    const res = await agent.post('/v1/auth/otp/verify').send({ phone: PHONE, code: good });
    expect(res.body.code).toBe('CODE_EXPIRED');
  });

  it('rejects an expired code', async () => {
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    await t.db.execute(sql`update phone_otps set expires_at = now() - interval '1 second'`);
    const res = await agent
      .post('/v1/auth/otp/verify')
      .send({ phone: PHONE, code: t.codeFor(PHONE) });
    expect(res.body.code).toBe('CODE_EXPIRED');
  });

  it('enforces a resend cooldown and per-phone caps (counted in the database)', async () => {
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    const tooSoon = await agent.post('/v1/auth/otp/request').send({ phone: PHONE });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.data.retryAfterSec).toBeGreaterThan(0);

    // Four more within the hour (cooldown elapsed) is the hourly maximum of five.
    for (let i = 0; i < 4; i++) {
      await t.db.execute(
        sql`update phone_otps set created_at = created_at - interval '61 seconds'`,
      );
      await agent.post('/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    }
    await t.db.execute(sql`update phone_otps set created_at = created_at - interval '61 seconds'`);
    const capped = await agent.post('/v1/auth/otp/request').send({ phone: PHONE });
    expect(capped.status).toBe(429);
    expect((await t.db.select().from(phoneOtps)).length).toBe(5);
  });

  it('keeps suspended players out', async () => {
    await t.player(PHONE, 'Ada Obi');
    await t.db.update(users).set({ status: 'suspended' });
    await t.db.execute(sql`update phone_otps set created_at = now() - interval '2 minutes'`);
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    const res = await agent
      .post('/v1/auth/otp/verify')
      .send({ phone: PHONE, code: t.codeFor(PHONE) });
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('lets a player change their display name and signs out', async () => {
    const agent = await t.player(PHONE, 'Ada Obi');
    const res = await agent.patch('/v1/me/profile').send({ displayName: 'Ada O' }).expect(200);
    expect(res.body.user.displayName).toBe('Ada O');
    await agent.post('/v1/auth/logout').send({}).expect(200);
    await agent.get('/v1/auth/session').expect(401);
  });

  it('rejects state-changing requests without the first-party header', async () => {
    const res = await t.raw().post('/v1/auth/otp/request').send({ phone: PHONE });
    expect(res.status).toBe(403);
  });
});

describe('per-player write limits', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('answers a flood of bank-detail changes with 429, not an error', async () => {
    const player = await t.player();
    const body = { bankCode: '058', accountNumber: '0123456789', accountName: 'Ada Obi' };
    for (let i = 0; i < 5; i++) {
      await player.put('/v1/me/payout-account').send(body).expect(200);
    }
    const res = await player.put('/v1/me/payout-account').send(body);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.body.data.retryAfterSec).toBeGreaterThan(0);
  });
});
