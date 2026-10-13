import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@predict/contracts';
import { adminUsers, eq, users, type Database } from '@predict/db';
import type { Request } from 'express';
import { clientIp, readBearerToken, readCookie, userAgent } from '../common/http';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB } from '../database/database.module';
import { COOKIE_NAMES } from './cookies';
import { AUTH_REQUEST_KEY, type AdminAuth, type Realm, type UserAuth } from './realm';
import type { ClientMeta } from './session.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

type AuthedRequest = Request & { [AUTH_REQUEST_KEY]?: UserAuth | AdminAuth };

const unauthorized = () => new UnauthorizedException('Sign in to continue.');

export const ROLES_KEY = 'adminRoles';
export const ALLOW_WITHOUT_MFA_KEY = 'allowWithoutMfa';

/** Restricts an admin route to these roles. Super admins can always pass. */
export const RequireRoles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

/** Admin routes usable before two-step sign-in is set up (session, setup itself, logout). */
export const AllowWithoutMfa = () => SetMetadata(ALLOW_WITHOUT_MFA_KEY, true);

abstract class AccessTokenGuard implements CanActivate {
  protected abstract readonly realm: Realm;

  constructor(
    protected readonly tokens: TokenService,
    protected readonly sessions: SessionService,
    @Inject(DB) protected readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readCookie(req, COOKIE_NAMES[this.realm].access) ?? readBearerToken(req);
    if (!token) throw unauthorized();

    const claims = await this.tokens.verifyAccess(this.realm, token);
    if (!claims) throw unauthorized();

    // Checked on every request so sign-out, deactivation and theft detection apply immediately.
    const session = await this.sessions.findActive(this.realm, claims.sessionId);
    if (!session || session.subjectId !== claims.subjectId) throw unauthorized();

    req[AUTH_REQUEST_KEY] = await this.authorize(
      context,
      claims.subjectId,
      claims.sessionId,
      session.familyId,
    );
    return true;
  }

  protected abstract authorize(
    context: ExecutionContext,
    subjectId: string,
    sessionId: string,
    familyId: string,
  ): Promise<UserAuth | AdminAuth>;
}

/** Requires a signed-in, active player. */
@Injectable()
export class UserAuthGuard extends AccessTokenGuard {
  protected readonly realm = 'user';

  protected async authorize(
    _context: ExecutionContext,
    userId: string,
    sessionId: string,
    familyId: string,
  ) {
    const [user] = await this.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId));
    if (!user || user.status !== 'active') throw unauthorized();
    return { realm: 'user', userId, sessionId, familyId } satisfies UserAuth;
  }
}

/**
 * Requires a signed-in, active admin who has set up two-step sign-in (when this deployment
 * requires it) and holds one of the route's roles.
 */
@Injectable()
export class AdminAuthGuard extends AccessTokenGuard {
  protected readonly realm = 'admin';

  constructor(
    tokens: TokenService,
    sessions: SessionService,
    @Inject(DB) db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector,
  ) {
    super(tokens, sessions, db);
  }

  protected async authorize(
    context: ExecutionContext,
    adminId: string,
    sessionId: string,
    familyId: string,
  ) {
    const [admin] = await this.db
      .select({
        status: adminUsers.status,
        role: adminUsers.role,
        totpEnabledAt: adminUsers.totpEnabledAt,
      })
      .from(adminUsers)
      .where(eq(adminUsers.id, adminId));
    if (!admin || admin.status !== 'active') throw unauthorized();

    const targets = [context.getHandler(), context.getClass()];
    const allowWithoutMfa = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WITHOUT_MFA_KEY,
      targets,
    );
    if (this.env.ADMIN_MFA_REQUIRED && !admin.totpEnabledAt && !allowWithoutMfa) {
      throw new ForbiddenException('Set up two-step sign-in to continue.');
    }

    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, targets);
    if (roles && admin.role !== 'super_admin' && !roles.includes(admin.role)) {
      throw new ForbiddenException('Your role does not allow this.');
    }

    return { realm: 'admin', adminId, role: admin.role, sessionId, familyId } satisfies AdminAuth;
  }
}

/** The principal a guard attached to this request. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthedRequest>()[AUTH_REQUEST_KEY],
);

/** IP and user agent of the caller, for rate limits and the session list. */
export const ClientInfo = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest<Request>();
  return { ip: clientIp(req), userAgent: userAgent(req) } satisfies ClientMeta;
});
