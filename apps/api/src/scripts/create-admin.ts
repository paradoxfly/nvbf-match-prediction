/**
 * Creates a staff account (there is no admin signup).
 *
 *   pnpm --filter @predict/api admin:create --email ada@scoutgram.africa --name "Ada" [--role super_admin|finance|operations]
 *   ... --reset-password   # issue a new password for an existing admin
 *
 * The password comes from ADMIN_PASSWORD, or a strong one is generated and printed once.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AdminRole, Email } from '@predict/contracts';
import { adminUsers, createDatabase, eq } from '@predict/db';
import { config } from 'dotenv';
import { randomToken } from '../common/crypto';
import { hashPassword } from '../common/passwords';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'operations' },
      'reset-password': { type: 'boolean', default: false },
    },
  });

  const email = Email.parse(values.email?.trim().toLowerCase());
  const role = AdminRole.parse(values.role);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

  const password = process.env.ADMIN_PASSWORD || randomToken(18);
  const passwordHash = await hashPassword(password);
  const { db, pool } = createDatabase(databaseUrl, { max: 1 });

  try {
    const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
    if (existing && !values['reset-password']) {
      throw new Error(`${email} is already an admin. Pass --reset-password to issue a new one.`);
    }
    if (existing) {
      await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, existing.id));
      console.warn(`Reset password for ${email}.`);
    } else {
      if (!values.name) throw new Error('--name is required for a new admin.');
      await db.insert(adminUsers).values({ email, name: values.name, role, passwordHash });
      console.warn(`Created ${role} ${email}.`);
    }
    if (!process.env.ADMIN_PASSWORD) {
      console.warn(`Password (shown once, store it in a password manager): ${password}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
