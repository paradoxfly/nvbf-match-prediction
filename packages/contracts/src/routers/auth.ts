import { oc } from '@orpc/contract';
import { z } from 'zod';
import { DisplayName, Ok, OtpCode, PhoneInput, RATE_LIMITED } from '../common';

export const SessionUser = z.object({
  id: z.uuid(),
  /** E.164, e.g. +2348031234567. Only ever shown to its owner. */
  phone: z.string(),
  displayName: z.string(),
});
export type SessionUser = z.infer<typeof SessionUser>;

export const AuthSession = z.object({ user: SessionUser });
export type AuthSession = z.infer<typeof AuthSession>;

export const RequestOtpInput = z.object({
  phone: PhoneInput,
  /** Cloudflare Turnstile token, required when the API has a Turnstile secret configured. */
  captchaToken: z.string().max(4096).optional(),
});
export type RequestOtpInput = z.infer<typeof RequestOtpInput>;

export const RequestOtpResult = z.object({
  /** The number the code was sent to, normalised to E.164. */
  phone: z.string(),
  expiresInSec: z.number().int(),
  resendAfterSec: z.number().int(),
  /**
   * Local development only (console SMS provider, not production): the code itself, so it can
   * be shown on screen instead of being read from the API log. Never set in production.
   */
  devCode: z.string().optional(),
});
export type RequestOtpResult = z.infer<typeof RequestOtpResult>;

export const VerifyOtpInput = z.object({ phone: PhoneInput, code: OtpCode });
export type VerifyOtpInput = z.infer<typeof VerifyOtpInput>;

/**
 * A correct code either signs an existing player in, or (first time) returns a short-lived
 * ticket to finish signing up, so no half-made accounts exist.
 */
export const VerifyOtpResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('signed_in'), user: SessionUser }),
  z.object({
    status: z.literal('needs_profile'),
    phone: z.string(),
    signupTicket: z.string(),
    expiresInSec: z.number().int(),
  }),
]);
export type VerifyOtpResult = z.infer<typeof VerifyOtpResult>;

export const CompleteSignupInput = z.object({
  signupTicket: z.string().min(1).max(2048),
  displayName: DisplayName,
  acceptTerms: z.literal(true, { error: 'Please accept the rules and terms.' }),
  confirmAdult: z.literal(true, { error: 'You must be 18 or older to play.' }),
});
export type CompleteSignupInput = z.infer<typeof CompleteSignupInput>;

export const UpdateProfileInput = z.object({ displayName: DisplayName });
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

const CODE_ERRORS = {
  INVALID_CODE: {
    status: 400,
    message: 'That code is not right.',
    data: z.object({ attemptsLeft: z.number().int() }),
  },
  CODE_EXPIRED: { status: 400, message: 'That code has expired. Request a new one.' },
  ACCOUNT_SUSPENDED: {
    status: 403,
    message: 'This account is suspended. Contact support if you think this is a mistake.',
  },
  RATE_LIMITED,
} as const;

const DISPLAY_NAME_TAKEN = {
  status: 409,
  message: 'That name is taken. Try another.',
} as const;

const tags = ['auth'];

export const authContract = {
  requestOtp: oc
    .route({ method: 'POST', path: '/auth/otp/request', tags, summary: 'Text a sign-in code' })
    .errors({
      INVALID_PHONE: { status: 400, message: 'Enter a valid Nigerian mobile number.' },
      CAPTCHA_FAILED: { status: 400, message: 'Please confirm you are not a robot.' },
      SMS_FAILED: {
        status: 503,
        message: 'We could not send the text right now. Try again in a minute.',
      },
      RATE_LIMITED,
    })
    .input(RequestOtpInput)
    .output(RequestOtpResult),

  verifyOtp: oc
    .route({ method: 'POST', path: '/auth/otp/verify', tags, summary: 'Check a sign-in code' })
    .errors({ ...CODE_ERRORS, INVALID_PHONE: { status: 400, message: 'Invalid phone number.' } })
    .input(VerifyOtpInput)
    .output(VerifyOtpResult),

  completeSignup: oc
    .route({ method: 'POST', path: '/auth/signup/complete', tags, summary: 'Create the account' })
    .errors({
      TICKET_EXPIRED: { status: 400, message: 'That took too long. Request a new code.' },
      DISPLAY_NAME_TAKEN,
      RATE_LIMITED,
    })
    .input(CompleteSignupInput)
    .output(AuthSession),

  refresh: oc
    .route({ method: 'POST', path: '/auth/refresh', tags, summary: 'Rotate the session' })
    .output(AuthSession),

  logout: oc.route({ method: 'POST', path: '/auth/logout', tags, summary: 'Sign out' }).output(Ok),

  session: oc
    .route({ method: 'GET', path: '/auth/session', tags, summary: 'Current session' })
    .output(AuthSession),

  updateProfile: oc
    .route({ method: 'PATCH', path: '/me/profile', tags, summary: 'Change display name' })
    .errors({ DISPLAY_NAME_TAKEN })
    .input(UpdateProfileInput)
    .output(AuthSession),
};
