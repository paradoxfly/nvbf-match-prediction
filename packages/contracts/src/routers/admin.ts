import { oc } from '@orpc/contract';
import { z } from 'zod';
import { AdminRole } from '../enums';
import { Email, Ok, RATE_LIMITED } from '../common';

export const AdminUser = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: AdminRole,
  mfaEnabled: z.boolean(),
  /** True when this deployment requires MFA and the admin hasn't set it up yet. */
  mfaSetupRequired: z.boolean(),
});
export type AdminUser = z.infer<typeof AdminUser>;

export const AdminSession = z.object({ admin: AdminUser });
export type AdminSession = z.infer<typeof AdminSession>;

export const TotpCode = z.string().regex(/^\d{6}$/, { error: 'Enter the 6-digit code.' });

export const AdminLoginInput = z.object({
  email: Email,
  password: z.string().min(1).max(128),
  /** Required once the admin has turned on two-step verification. */
  totpCode: TotpCode.optional(),
});
export type AdminLoginInput = z.infer<typeof AdminLoginInput>;

export const MfaSetup = z.object({
  /** Base32 secret, shown for manual entry. */
  secret: z.string(),
  /** `otpauth://` URI for the QR code. */
  otpauthUrl: z.string(),
});
export type MfaSetup = z.infer<typeof MfaSetup>;

const authTags = ['admin-auth'];

export const adminAuthContract = {
  login: oc
    .route({ method: 'POST', path: '/admin/auth/login', tags: authTags, summary: 'Admin sign in' })
    .errors({
      INVALID_CREDENTIALS: { status: 401, message: 'Email or password is incorrect.' },
      TOTP_REQUIRED: { status: 401, message: 'Enter the code from your authenticator app.' },
      INVALID_TOTP: { status: 401, message: 'That code is not right. Try the latest one.' },
      RATE_LIMITED,
    })
    .input(AdminLoginInput)
    .output(AdminSession),

  refresh: oc
    .route({ method: 'POST', path: '/admin/auth/refresh', tags: authTags })
    .output(AdminSession),

  logout: oc.route({ method: 'POST', path: '/admin/auth/logout', tags: authTags }).output(Ok),

  session: oc
    .route({ method: 'GET', path: '/admin/auth/session', tags: authTags })
    .output(AdminSession),

  /** Starts (or restarts) two-step setup: a new secret that only takes effect once confirmed. */
  mfaSetup: oc
    .route({ method: 'POST', path: '/admin/auth/mfa/setup', tags: authTags })
    .errors({ MFA_ALREADY_ENABLED: { status: 409, message: 'Two-step sign-in is already on.' } })
    .output(MfaSetup),

  mfaEnable: oc
    .route({ method: 'POST', path: '/admin/auth/mfa/enable', tags: authTags })
    .errors({
      INVALID_TOTP: { status: 400, message: 'That code is not right. Try the latest one.' },
      MFA_NOT_STARTED: { status: 409, message: 'Start the setup first.' },
      RATE_LIMITED,
    })
    .input(z.object({ code: TotpCode }))
    .output(AdminSession),
};
