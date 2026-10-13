import { Controller, Inject, Req, UseGuards } from '@nestjs/common';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { contract } from '@predict/contracts';
import type { Request } from 'express';
import { withContractErrors } from '../common/domain-error';
import { readCookie } from '../common/http';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { clearAuthCookies, COOKIE_NAMES, setAuthCookies } from '../auth/cookies';
import { AdminAuthGuard, AllowWithoutMfa, ClientInfo, CurrentAuth } from '../auth/guards';
import type { AdminAuth } from '../auth/realm';
import { SessionService, type ClientMeta } from '../auth/session.service';
import { TokenService } from '../auth/token.service';
import { AdminAuthService } from './admin-auth.service';

@Controller()
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Implement(contract.admin.auth.login)
  login(@ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.auth.login).handler(({ input, errors, context }) =>
      withContractErrors(errors, async () => {
        const { session, admin } = await this.adminAuth.login(input, meta);
        setAuthCookies(context.resHeaders, 'admin', session.tokens, this.env);
        return { admin };
      }),
    );
  }

  @Implement(contract.admin.auth.refresh)
  refresh(@Req() req: Request, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.auth.refresh).handler(async ({ context }) => {
      const token = readCookie(req, COOKIE_NAMES.admin.refresh);
      const result = token ? await this.adminAuth.refresh(token, meta) : null;
      if (!result) {
        clearAuthCookies(context.resHeaders, 'admin', this.env);
        throw new ORPCError('UNAUTHORIZED', { message: 'Your session has ended. Sign in again.' });
      }
      setAuthCookies(context.resHeaders, 'admin', result.session.tokens, this.env);
      return { admin: result.admin };
    });
  }

  @Implement(contract.admin.auth.logout)
  logout(@Req() req: Request) {
    return implement(contract.admin.auth.logout).handler(async ({ context }) => {
      const refresh = readCookie(req, COOKIE_NAMES.admin.refresh);
      const access = readCookie(req, COOKIE_NAMES.admin.access);
      const claims = access ? await this.tokens.verifyAccess('admin', access) : null;
      const familyId =
        (refresh && (await this.sessions.familyOfRefreshToken(refresh))) ||
        (claims && (await this.sessions.familyOfSession(claims.sessionId)));
      if (familyId) await this.sessions.revokeFamily(familyId);
      clearAuthCookies(context.resHeaders, 'admin', this.env);
      return { ok: true } as const;
    });
  }

  @UseGuards(AdminAuthGuard)
  @AllowWithoutMfa()
  @Implement(contract.admin.auth.session)
  session(@CurrentAuth() auth: AdminAuth) {
    return implement(contract.admin.auth.session).handler(async () => {
      const admin = await this.adminAuth.find(auth.adminId);
      if (!admin) throw new ORPCError('UNAUTHORIZED');
      return { admin };
    });
  }

  @UseGuards(AdminAuthGuard)
  @AllowWithoutMfa()
  @Implement(contract.admin.auth.mfaSetup)
  mfaSetup(@CurrentAuth() auth: AdminAuth) {
    return implement(contract.admin.auth.mfaSetup).handler(({ errors }) =>
      withContractErrors(errors, () => this.adminAuth.setupMfa(auth.adminId)),
    );
  }

  @UseGuards(AdminAuthGuard)
  @AllowWithoutMfa()
  @Implement(contract.admin.auth.mfaEnable)
  mfaEnable(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.auth.mfaEnable).handler(({ input, errors }) =>
      withContractErrors(errors, async () => ({
        admin: await this.adminAuth.enableMfa(auth.adminId, input.code, meta),
      })),
    );
  }
}
