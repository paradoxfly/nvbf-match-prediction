import type { AdminAuth } from '../auth/realm';
import type { ClientMeta } from '../auth/session.service';
import type { Actor } from './audit.service';

/** The audit actor for an admin request. */
export const adminActor = (auth: AdminAuth, meta?: ClientMeta): Actor => ({
  type: 'admin',
  id: auth.adminId,
  ip: meta?.ip,
});
