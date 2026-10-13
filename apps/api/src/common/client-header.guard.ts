import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLIENT_HEADER } from '@predict/contracts';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Metadata key for routes authenticated some other way (e.g. signed storage URLs). */
export const SKIP_CLIENT_HEADER = 'skipClientHeader';

/**
 * CSRF defence for cookie-authenticated requests: every state-changing request must carry the
 * `x-pd-client` header. Browsers can't add custom headers cross-site without a CORS preflight,
 * which this API never approves.
 */
@Injectable()
export class ClientHeaderGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CLIENT_HEADER, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip || typeof req.headers[CLIENT_HEADER] === 'string') return true;
    throw new ForbiddenException(`Missing ${CLIENT_HEADER} header.`);
  }
}
