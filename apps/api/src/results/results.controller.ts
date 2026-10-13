import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import { adminActor } from '../common/actor';
import { withContractErrors } from '../common/domain-error';
import { orNotFound } from '../common/not-found';
import {
  AdminAuthGuard,
  ClientInfo,
  CurrentAuth,
  RequireRoles,
  UserAuthGuard,
} from '../auth/guards';
import type { AdminAuth, UserAuth } from '../auth/realm';
import type { ClientMeta } from '../auth/session.service';
import { LeaderboardService } from './leaderboard.service';
import { ResultsService } from './results.service';

@Controller()
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Implement(contract.leaderboard.day)
  day() {
    return implement(contract.leaderboard.day).handler(({ input }) =>
      orNotFound('Match-day', () => this.leaderboard.publicView(input.date, input.limit)),
    );
  }

  @UseGuards(UserAuthGuard)
  @Implement(contract.leaderboard.mine)
  mine(@CurrentAuth() auth: UserAuth) {
    return implement(contract.leaderboard.mine).handler(({ input }) =>
      orNotFound('Match-day', () => this.leaderboard.mine(auth.userId, input.date)),
    );
  }
}

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminResultsController {
  constructor(private readonly results: ResultsService) {}

  @Implement(contract.admin.results.versions)
  versions() {
    return implement(contract.admin.results.versions).handler(async ({ input }) => ({
      items: await this.results.versions(input.id),
    }));
  }

  @RequireRoles('operations')
  @Implement(contract.admin.results.enter)
  enter(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.results.enter).handler(({ input, errors }) =>
      orNotFound('Match', () =>
        withContractErrors(errors, () =>
          this.results.enter(adminActor(auth, meta), auth.role, input),
        ),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.results.confirm)
  confirm(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.results.confirm).handler(({ input, errors }) =>
      orNotFound('Match', () =>
        withContractErrors(errors, () =>
          this.results.confirm(adminActor(auth, meta), auth.role, input.id),
        ),
      ),
    );
  }

  @Implement(contract.admin.results.leaderboard)
  leaderboard() {
    return implement(contract.admin.results.leaderboard).handler(({ input }) =>
      orNotFound('Match-day', () => this.results.adminLeaderboard(input.id)),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.results.finalize)
  finalize(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.results.finalize).handler(({ input, errors }) =>
      orNotFound('Match-day', () =>
        withContractErrors(errors, () =>
          this.results.finalize(adminActor(auth, meta), input.id, input.acknowledgeWarnings),
        ),
      ),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.results.reopen)
  reopen(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.results.reopen).handler(({ input, errors }) =>
      orNotFound('Match-day', () =>
        withContractErrors(errors, () =>
          this.results.reopen(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.results.cancel)
  cancel(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.results.cancel).handler(({ input, errors }) =>
      orNotFound('Match-day', () =>
        withContractErrors(errors, () =>
          this.results.cancel(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }
}
