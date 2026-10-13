import { Inject, Injectable } from '@nestjs/common';
import { product } from '@predict/brand';
import type { AdminLoginInput, AdminUser, MfaSetup } from '@predict/contracts';
import { adminUsers, and, eq, isNull, lt, or, type Database } from '@predict/db';
import { AuditService } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { EncryptionService } from '../common/encryption.service';
import { enforceLimits, MINUTE } from '../common/limits';
import { verifyAgainstDummy, verifyPassword } from '../common/passwords';
import { RateLimitService } from '../common/rate-limit.service';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../common/totp';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB } from '../database/database.module';
import { SessionService, type ClientMeta, type StartedSession } from '../auth/session.service';

type AdminRow = typeof adminUsers.$inferSelect;

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly sessions: SessionService,
    private readonly limits: RateLimitService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  async login(
    input: AdminLoginInput,
    meta: ClientMeta,
  ): Promise<{ session: StartedSession; admin: AdminUser }> {
    const email = input.email.trim().toLowerCase();
    await enforceLimits(this.limits, [
      { key: `admin-login:ip:${meta.ip}`, limit: 10, windowSec: 15 * MINUTE },
      { key: `admin-login:email:${email}`, limit: 10, windowSec: 15 * MINUTE },
    ]);

    const [admin] = await this.db.select().from(adminUsers).where(eq(adminUsers.email, email));
    const passwordOk = admin
      ? await verifyPassword(admin.passwordHash, input.password)
      : await verifyAgainstDummy(input.password);
    // Disabled admins get the same answer as a wrong password.
    if (!admin || !passwordOk || admin.status !== 'active') {
      throw new DomainError('INVALID_CREDENTIALS');
    }

    if (admin.totpEnabledAt) {
      if (!input.totpCode) throw new DomainError('TOTP_REQUIRED');
      await this.acceptTotp(admin, input.totpCode);
    }

    await this.db
      .update(adminUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminUsers.id, admin.id));
    const session = await this.sessions.start('admin', admin.id, meta);
    await this.audit.record(
      null,
      { type: 'admin', id: admin.id, ip: meta.ip },
      {
        action: 'admin.login',
        targetType: 'admin_user',
        targetId: admin.id,
      },
    );
    return { session, admin: this.toAdminUser(admin) };
  }

  async refresh(refreshToken: string, meta: ClientMeta) {
    const session = await this.sessions.rotate('admin', refreshToken, meta);
    if (!session) return null;
    const admin = await this.find(session.subjectId);
    if (!admin) {
      await this.sessions.revokeFamily(session.familyId);
      return null;
    }
    return { session, admin };
  }

  /** Issues a fresh secret. It only takes effect once confirmed with a code (`enableMfa`). */
  async setupMfa(adminId: string): Promise<MfaSetup> {
    const admin = await this.require(adminId);
    if (admin.totpEnabledAt) throw new DomainError('MFA_ALREADY_ENABLED');
    const secret = generateTotpSecret();
    await this.db
      .update(adminUsers)
      .set({ totpSecretEnc: this.encryption.encrypt(secret), totpLastStep: null })
      .where(eq(adminUsers.id, adminId));
    return { secret, otpauthUrl: otpauthUrl(secret, admin.email, `${product.name} Admin`) };
  }

  async enableMfa(adminId: string, code: string, meta: ClientMeta): Promise<AdminUser> {
    await enforceLimits(this.limits, [
      { key: `admin-mfa:${adminId}`, limit: 10, windowSec: 15 * MINUTE },
    ]);
    const admin = await this.require(adminId);
    if (admin.totpEnabledAt) return this.toAdminUser(admin);
    if (!admin.totpSecretEnc) throw new DomainError('MFA_NOT_STARTED');
    await this.acceptTotp(admin, code);

    await this.db.transaction(async (tx) => {
      await tx
        .update(adminUsers)
        .set({ totpEnabledAt: new Date() })
        .where(eq(adminUsers.id, adminId));
      await this.audit.record(
        tx,
        { type: 'admin', id: adminId, ip: meta.ip },
        {
          action: 'admin.mfa_enabled',
          targetType: 'admin_user',
          targetId: adminId,
        },
      );
    });
    return this.toAdminUser(await this.require(adminId));
  }

  /** The admin if they exist and are active. */
  async find(adminId: string): Promise<AdminUser | null> {
    const [admin] = await this.db.select().from(adminUsers).where(eq(adminUsers.id, adminId));
    return admin && admin.status === 'active' ? this.toAdminUser(admin) : null;
  }

  private async require(adminId: string): Promise<AdminRow> {
    const [admin] = await this.db.select().from(adminUsers).where(eq(adminUsers.id, adminId));
    if (!admin || admin.status !== 'active') throw new DomainError('NOT_FOUND');
    return admin;
  }

  /** Verifies a code and records its time step, so the same code can't be used twice. */
  private async acceptTotp(admin: AdminRow, code: string) {
    const secret = admin.totpSecretEnc ? this.encryption.decrypt(admin.totpSecretEnc) : null;
    const step = secret ? verifyTotp(secret, code) : null;
    if (step === null) throw new DomainError('INVALID_TOTP');
    // Conditional update: two requests racing with the same code can't both win.
    const claimed = await this.db
      .update(adminUsers)
      .set({ totpLastStep: step })
      .where(
        and(
          eq(adminUsers.id, admin.id),
          or(isNull(adminUsers.totpLastStep), lt(adminUsers.totpLastStep, step)),
        ),
      )
      .returning({ id: adminUsers.id });
    if (claimed.length === 0) throw new DomainError('INVALID_TOTP');
  }

  private toAdminUser(row: AdminRow): AdminUser {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      mfaEnabled: row.totpEnabledAt !== null,
      mfaSetupRequired: this.env.ADMIN_MFA_REQUIRED && row.totpEnabledAt === null,
    };
  }
}
