import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import { adminActor } from '../common/actor';
import { orNotFound } from '../common/not-found';
import { AdminAuthGuard, ClientInfo, CurrentAuth, RequireRoles } from '../auth/guards';
import type { AdminAuth } from '../auth/realm';
import type { ClientMeta } from '../auth/session.service';
import { StaffService } from './staff.service';

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminStaffController {
  constructor(private readonly staff: StaffService) {}

  @Implement(contract.admin.players.list)
  players() {
    return implement(contract.admin.players.list).handler(({ input }) => this.staff.players(input));
  }

  @Implement(contract.admin.players.get)
  player() {
    return implement(contract.admin.players.get).handler(({ input }) =>
      orNotFound('Player', () => this.staff.player(input.id)),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.players.setStatus)
  setStatus(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.players.setStatus).handler(({ input }) =>
      orNotFound('Player', () =>
        this.staff.setPlayerStatus(adminActor(auth, meta), input.id, input.status, input.reason),
      ),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.audit.list)
  auditLog() {
    return implement(contract.admin.audit.list).handler(({ input }) => this.staff.auditLog(input));
  }

  @RequireRoles('finance')
  @Implement(contract.admin.reports.reconciliation)
  reconciliation() {
    return implement(contract.admin.reports.reconciliation).handler(({ input }) =>
      this.staff.reconciliation(input.leagueId),
    );
  }
}
