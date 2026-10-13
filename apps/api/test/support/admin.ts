import type { AdminRole } from '@predict/contracts';
import { adminUsers } from '@predict/db';
import { hashPassword } from '../../src/common/passwords';
import type { TestApp } from './test-app';

export const ADMIN_PASSWORD = 'staff-password-123';

/** Creates an admin with the given role and returns a signed-in admin client. */
export async function adminClient(
  t: TestApp,
  role: AdminRole = 'super_admin',
  email = `${role}@predict.test`,
) {
  await t.db
    .insert(adminUsers)
    .values({
      email,
      name: `Staff (${role})`,
      role,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
    })
    .onConflictDoNothing();
  const admin = t.client();
  await admin.post('/v1/admin/auth/login').send({ email, password: ADMIN_PASSWORD }).expect(200);
  return admin;
}
