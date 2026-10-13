import { emailOtps, sql, users } from '@predict/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EmailService } from '../src/email/email.service';
import { createTestApp, type TestApp } from './support/test-app';

const EMAIL = 'ada@example.com';
const PHONE = '+2348031234567';

describe('player sign-in (email code, phone collected)', () => {
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

  async function verified(email = EMAIL) {
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ email }).expect(200);
    const verify = await agent
      .post('/v1/auth/otp/verify')
      .send({ email, code: t.codeFor(email) })
      .expect(200);
    return { agent, ticket: verify.body.signupTicket as string, body: verify.body };
  }

  const profile = (signupTicket: string, overrides: Record<string, unknown> = {}) => ({
    signupTicket,
    displayName: 'Ada Obi',
    phone: '0803 123 4567',
    acceptTerms: true,
    confirmAdult: true,
    ...overrides,
  });

  it('normalises the address and emails a code', async () => {
    const res = await t.client().post('/v1/auth/otp/request').send({ email: '  Ada@Example.COM ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: EMAIL, expiresInSec: 300, resendAfterSec: 60 });
    expect(t.codeFor(EMAIL)).toMatch(/^\d{6}$/);
    // With the console transport (local only) the code comes back for the screen to show.
    expect(res.body.devCode).toBe(t.codeFor(EMAIL));
    // The code itself is never stored, not even in the subject.
    const rows = await t.db.execute<{ content: unknown; purpose: string; subject: string }>(
      sql`select content, purpose, subject from email_messages`,
    );
    expect(rows.rows).toEqual([{ content: null, purpose: 'otp', subject: expect.any(String) }]);
    expect(rows.rows[0]!.subject).not.toContain(t.codeFor(EMAIL));
    expect(t.emails.sent[0]!.email.subject).toContain(t.codeFor(EMAIL));
  });

  it('rejects addresses that are not email addresses', async () => {
    for (const email of ['ada', 'ada@', '@example.com', '']) {
      const res = await t.client().post('/v1/auth/otp/request').send({ email });
      expect(res.status).toBe(400);
    }
  });

  it('signs up a new player in three steps and signs them back in later', async () => {
    const { agent, ticket, body } = await verified();
    expect(body.status).toBe('needs_profile');
    // No account exists until the profile is completed.
    expect((await t.db.select().from(users)).length).toBe(0);

    const done = await agent.post('/v1/auth/signup/complete').send(profile(ticket)).expect(200);
    expect(done.body.user).toMatchObject({ email: EMAIL, phone: PHONE, displayName: 'Ada Obi' });
    await agent.get('/v1/auth/session').expect(200);

    // Next time the same address goes straight in.
    const other = t.client();
    await t.db.execute(sql`update email_otps set created_at = now() - interval '2 minutes'`);
    await other.post('/v1/auth/otp/request').send({ email: EMAIL }).expect(200);
    const again = await other
      .post('/v1/auth/otp/verify')
      .send({ email: EMAIL, code: t.codeFor(EMAIL) })
      .expect(200);
    expect(again.body).toMatchObject({ status: 'signed_in', user: { displayName: 'Ada Obi' } });
    await other.get('/v1/auth/session').expect(200);
  });

  it('collects a valid phone number that no other account uses', async () => {
    await t.player(PHONE, 'First Player');
    const { agent, ticket } = await verified('bayo@example.com');

    const foreign = await agent
      .post('/v1/auth/signup/complete')
      .send(profile(ticket, { displayName: 'Bayo', phone: '+447911123456' }));
    expect(foreign.body.code).toBe('INVALID_PHONE');

    // The same number written another way is still the same number.
    const taken = await agent
      .post('/v1/auth/signup/complete')
      .send(profile(ticket, { displayName: 'Bayo', phone: '08031234567' }));
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('PHONE_TAKEN');

    await agent
      .post('/v1/auth/signup/complete')
      .send(profile(ticket, { displayName: 'Bayo', phone: '0806 123 4567' }))
      .expect(200);
  });

  it('requires 18+ and accepted terms, and unique display names', async () => {
    await t.player(PHONE, 'Taken Name');
    const { agent, ticket } = await verified('new@example.com');
    const fresh = { phone: '08061234567' };

    const minor = await agent
      .post('/v1/auth/signup/complete')
      .send(profile(ticket, { ...fresh, displayName: 'New Player', confirmAdult: false }));
    expect(minor.status).toBe(400);

    const clash = await agent
      .post('/v1/auth/signup/complete')
      .send(profile(ticket, { ...fresh, displayName: 'taken name' }));
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('DISPLAY_NAME_TAKEN');
  });

  it('counts wrong codes and kills the code after 5 tries', async () => {
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ email: EMAIL }).expect(200);
    const good = t.codeFor(EMAIL);
    const bad = good === '000000' ? '111111' : '000000';
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await agent.post('/v1/auth/otp/verify').send({ email: EMAIL, code: bad });
      expect(res.body.code).toBe('INVALID_CODE');
      expect(res.body.data.attemptsLeft).toBe(5 - attempt);
    }
    const res = await agent.post('/v1/auth/otp/verify').send({ email: EMAIL, code: good });
    expect(res.body.code).toBe('CODE_EXPIRED');
  });

  it('rejects an expired code', async () => {
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ email: EMAIL }).expect(200);
    await t.db.execute(sql`update email_otps set expires_at = now() - interval '1 second'`);
    const res = await agent
      .post('/v1/auth/otp/verify')
      .send({ email: EMAIL, code: t.codeFor(EMAIL) });
    expect(res.body.code).toBe('CODE_EXPIRED');
  });

  it('enforces a resend cooldown and per-address caps (counted in the database)', async () => {
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ email: EMAIL }).expect(200);
    const tooSoon = await agent.post('/v1/auth/otp/request').send({ email: EMAIL });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.data.retryAfterSec).toBeGreaterThan(0);

    // Four more within the hour (cooldown elapsed) is the hourly maximum of five.
    for (let i = 0; i < 4; i++) {
      await t.db.execute(
        sql`update email_otps set created_at = created_at - interval '61 seconds'`,
      );
      await agent.post('/v1/auth/otp/request').send({ email: EMAIL }).expect(200);
    }
    await t.db.execute(sql`update email_otps set created_at = created_at - interval '61 seconds'`);
    const capped = await agent.post('/v1/auth/otp/request').send({ email: EMAIL });
    expect(capped.status).toBe(429);
    expect((await t.db.select().from(emailOtps)).length).toBe(5);
  });

  it('keeps suspended players out', async () => {
    await t.player(PHONE, 'Ada Obi', EMAIL);
    await t.db.update(users).set({ status: 'suspended' });
    await t.db.execute(sql`update email_otps set created_at = now() - interval '2 minutes'`);
    const agent = t.client();
    await agent.post('/v1/auth/otp/request').send({ email: EMAIL }).expect(200);
    const res = await agent
      .post('/v1/auth/otp/verify')
      .send({ email: EMAIL, code: t.codeFor(EMAIL) });
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
    const res = await t.raw().post('/v1/auth/otp/request').send({ email: EMAIL });
    expect(res.status).toBe(403);
  });
});

describe('notification emails', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('queues a bank-detail change alert and sends it from the outbox', async () => {
    const player = await t.player(PHONE, 'Ada Obi', EMAIL);
    const body = { bankCode: '058', accountNumber: '0123456789', accountName: 'Ada Obi' };
    await player.put('/v1/me/payout-account').send(body).expect(200);
    await player
      .put('/v1/me/payout-account')
      .send({ ...body, accountNumber: '9876543210' })
      .expect(200);

    await t.app.get(EmailService).processOutbox();
    const alert = t.emails.sent.find((m) => m.purpose === 'payout_account_changed');
    expect(alert).toMatchObject({
      to: EMAIL,
      email: { heading: 'Your bank details were changed' },
    });
    const rows = await t.db.execute<{ status: string }>(
      sql`select status from email_messages where purpose = 'payout_account_changed'`,
    );
    expect(rows.rows).toEqual([{ status: 'sent' }]);
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
