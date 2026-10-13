import { Controller, Inject, Req, UseGuards } from '@nestjs/common';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { contract } from '@predict/contracts';
import type { Request } from 'express';
import { withContractErrors } from '../common/domain-error';
import { readCookie } from '../common/http';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';
import { clearAuthCookies, COOKIE_NAMES, setAuthCookies } from './cookies';
import { ClientInfo, CurrentAuth, UserAuthGuard } from './guards';
import type { UserAuth } from './realm';
import type { ClientMeta } from './session.service';
import { TokenService } from './token.service';

const OK = { ok: true } as const;

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Implement(contract.auth.requestOtp)
  requestOtp(@ClientInfo() meta: ClientMeta) {
    return implement(contract.auth.requestOtp).handler(({ input, errors }) =>
      withContractErrors(errors, () => this.auth.requestOtp(input, meta)),
    );
  }

  @Implement(contract.auth.verifyOtp)
  verifyOtp(@ClientInfo() meta: ClientMeta) {
    return implement(contract.auth.verifyOtp).handler(({ input, errors, context }) =>
      withContractErrors(errors, async () => {
        const outcome = await this.auth.verifyOtp(input, meta);
        if (outcome.status === 'needs_profile') return outcome;
        setAuthCookies(context.resHeaders, 'user', outcome.session.tokens, this.env);
        return { status: 'signed_in' as const, user: outcome.user };
      }),
    );
  }

  @Implement(contract.auth.completeSignup)
  completeSignup(@ClientInfo() meta: ClientMeta) {
    return implement(contract.auth.completeSignup).handler(({ input, errors, context }) =>
      withContractErrors(errors, async () => {
        const { session, user } = await this.auth.completeSignup(input, meta);
        setAuthCookies(context.resHeaders, 'user', session.tokens, this.env);
        return { user };
      }),
    );
  }

  @Implement(contract.auth.refresh)
  refresh(@Req() req: Request, @ClientInfo() meta: ClientMeta) {
    return implement(contract.auth.refresh).handler(async ({ context }) => {
      const token = readCookie(req, COOKIE_NAMES.user.refresh);
      const result = token ? await this.auth.refresh(token, meta) : null;
      if (!result) {
        clearAuthCookies(context.resHeaders, 'user', this.env);
        throw new ORPCError('UNAUTHORIZED', { message: 'Your session has ended. Sign in again.' });
      }
      setAuthCookies(context.resHeaders, 'user', result.session.tokens, this.env);
      return { user: result.user };
    });
  }

  @Implement(contract.auth.logout)
  logout(@Req() req: Request) {
    return implement(contract.auth.logout).handler(async ({ context }) => {
      const access = readCookie(req, COOKIE_NAMES.user.access);
      const claims = access ? await this.tokens.verifyAccess('user', access) : null;
      await this.auth.logout(readCookie(req, COOKIE_NAMES.user.refresh), claims?.sessionId);
      clearAuthCookies(context.resHeaders, 'user', this.env);
      return OK;
    });
  }

  @UseGuards(UserAuthGuard)
  @Implement(contract.auth.session)
  session(@CurrentAuth() auth: UserAuth) {
    return implement(contract.auth.session).handler(async () => ({
      user: await this.auth.sessionUser(auth.userId),
    }));
  }

  @UseGuards(UserAuthGuard)
  @Implement(contract.auth.updateProfile)
  updateProfile(@CurrentAuth() auth: UserAuth) {
    return implement(contract.auth.updateProfile).handler(({ input, errors }) =>
      withContractErrors(errors, async () => ({
        user: await this.auth.updateProfile(auth.userId, input.displayName),
      })),
    );
  }
}
