import { Controller, Req, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import type { Request } from 'express';
import { adminActor } from '../common/actor';
import { withContractErrors } from '../common/domain-error';
import { readBearerToken, readCookie } from '../common/http';
import { orNotFound } from '../common/not-found';
import { COOKIE_NAMES } from '../auth/cookies';
import {
  AdminAuthGuard,
  ClientInfo,
  CurrentAuth,
  RequireRoles,
  UserAuthGuard,
} from '../auth/guards';
import type { AdminAuth, UserAuth } from '../auth/realm';
import type { ClientMeta } from '../auth/session.service';
import { SessionService } from '../auth/session.service';
import { TokenService } from '../auth/token.service';
import { JackpotService } from './jackpot.service';

@Controller()
export class JackpotController {
  constructor(
    private readonly jackpot: JackpotService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  /** Public, but marks the caller's own row when they're signed in. */
  @Implement(contract.jackpot.view)
  view(@Req() req: Request) {
    return implement(contract.jackpot.view).handler(({ errors }) =>
      withContractErrors(errors, async () => this.jackpot.view(await this.optionalUser(req))),
    );
  }

  @UseGuards(UserAuthGuard)
  @Implement(contract.jackpot.mine)
  mine(@CurrentAuth() auth: UserAuth) {
    return implement(contract.jackpot.mine).handler(({ errors }) =>
      withContractErrors(errors, () => this.jackpot.mine(auth.userId)),
    );
  }

  @UseGuards(UserAuthGuard)
  @Implement(contract.jackpot.submit)
  submit(@CurrentAuth() auth: UserAuth) {
    return implement(contract.jackpot.submit).handler(({ input, errors }) =>
      withContractErrors(errors, () => this.jackpot.submit(auth.userId, input.orders)),
    );
  }

  private async optionalUser(req: Request): Promise<string | null> {
    const token = readCookie(req, COOKIE_NAMES.user.access) ?? readBearerToken(req);
    const claims = token ? await this.tokens.verifyAccess('user', token) : null;
    if (!claims) return null;
    const session = await this.sessions.findActive('user', claims.sessionId);
    return session?.subjectId === claims.subjectId ? claims.subjectId : null;
  }
}

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminJackpotController {
  constructor(private readonly jackpot: JackpotService) {}

  @Implement(contract.admin.jackpot.get)
  get() {
    return implement(contract.admin.jackpot.get).handler(({ input }) =>
      orNotFound('League', () => this.jackpot.adminView(input.id)),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.jackpot.settle)
  settle(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.jackpot.settle).handler(({ input, errors }) =>
      orNotFound('League', () =>
        withContractErrors(errors, () => this.jackpot.settle(adminActor(auth, meta), input.id)),
      ),
    );
  }
}
