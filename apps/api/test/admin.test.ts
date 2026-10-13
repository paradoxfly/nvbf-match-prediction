import { adminUsers, auditLogs, eq } from '@predict/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/common/passwords';
import { totpCode, totpStep } from '../src/common/totp';
import { ADMIN_PASSWORD, adminClient } from './support/admin';
import { createTestApp, type TestApp } from './support/test-app';
import { pngBytes, uploadLogo } from './support/uploads';

describe('admin sign-in, two-step verification and roles', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { ADMIN_MFA_REQUIRED: 'true' } });
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await t.reset();
  });

  async function createAdmin(email = 'ops@predict.test') {
    await t.db.insert(adminUsers).values({
      email,
      name: 'Ops',
      role: 'operations',
      passwordHash: await hashPassword(ADMIN_PASSWORD),
    });
    return email;
  }

  it('rejects a wrong password with the same error as an unknown email', async () => {
    await createAdmin();
    const wrong = await t
      .client()
      .post('/v1/admin/auth/login')
      .send({ email: 'ops@predict.test', password: 'nope-nope-nope' });
    const unknown = await t
      .client()
      .post('/v1/admin/auth/login')
      .send({ email: 'ghost@predict.test', password: 'nope-nope-nope' });
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('forces two-step setup, then requires a fresh code at every sign-in', async () => {
    const email = await createAdmin();
    const admin = t.client();
    const login = await admin
      .post('/v1/admin/auth/login')
      .send({ email, password: ADMIN_PASSWORD })
      .expect(200);
    expect(login.body.admin).toMatchObject({ mfaEnabled: false, mfaSetupRequired: true });

    // Everything except setup is blocked until two-step sign-in is on.
    await admin.post('/v1/admin/media/uploads').send({}).expect(403);

    const setup = await admin.post('/v1/admin/auth/mfa/setup').send({}).expect(200);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    const code = totpCode(setup.body.secret, totpStep());
    const enabled = await admin.post('/v1/admin/auth/mfa/enable').send({ code }).expect(200);
    expect(enabled.body.admin).toMatchObject({ mfaEnabled: true, mfaSetupRequired: false });

    // A new sign-in needs a code, and the code just used can't be replayed.
    const noCode = await t
      .client()
      .post('/v1/admin/auth/login')
      .send({ email, password: ADMIN_PASSWORD });
    expect(noCode.body.code).toBe('TOTP_REQUIRED');
    const replay = await t
      .client()
      .post('/v1/admin/auth/login')
      .send({ email, password: ADMIN_PASSWORD, totpCode: code });
    expect(replay.body.code).toBe('INVALID_TOTP');

    const audits = await t.db.select().from(auditLogs);
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(['admin.login', 'admin.mfa_enabled']),
    );
  });

  it('stores TOTP secrets encrypted', async () => {
    const email = await createAdmin();
    const admin = t.client();
    await admin.post('/v1/admin/auth/login').send({ email, password: ADMIN_PASSWORD }).expect(200);
    const setup = await admin.post('/v1/admin/auth/mfa/setup').send({}).expect(200);
    const [row] = await t.db.select().from(adminUsers).where(eq(adminUsers.email, email));
    expect(row!.totpSecretEnc).toBeTruthy();
    expect(row!.totpSecretEnc).not.toContain(setup.body.secret);
  });
});

describe('admin logo uploads', () => {
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

  it('accepts a PNG logo and re-encodes it as WebP within 512px', async () => {
    const admin = await adminClient(t, 'operations');
    const res = await uploadLogo(admin, await pngBytes(1200, 600));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', mimeType: 'image/webp', width: 512 });
    expect(res.body.url).toMatch(/\/v1\/storage\/public\//);
  });

  it('rejects a file that lies about being an image', async () => {
    const admin = await adminClient(t, 'operations');
    const res = await uploadLogo(admin, Buffer.from('definitely not a png file'), 'image/png');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_FILE');
  });

  it('keeps players out of admin routes', async () => {
    const player = await t.player();
    await player.post('/v1/admin/media/uploads').send({}).expect(401);
  });
});
