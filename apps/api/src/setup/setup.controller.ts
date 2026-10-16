import { Controller, ForbiddenException, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import { adminActor } from '../common/actor';
import { withContractErrors } from '../common/domain-error';
import { orNotFound } from '../common/not-found';
import { AdminAuthGuard, ClientInfo, CurrentAuth, RequireRoles } from '../auth/guards';
import type { AdminAuth } from '../auth/realm';
import type { ClientMeta } from '../auth/session.service';
import { DaysService } from './days.service';
import { LeaguesService } from './leagues.service';
import { SettingsService } from './settings.service';
import { StandingsService } from './standings.service';
import { TeamsService } from './teams.service';

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminTeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Implement(contract.admin.teams.list)
  list() {
    return implement(contract.admin.teams.list).handler(async ({ input }) => ({
      items: await this.teams.list(input.category, input.includeArchived),
    }));
  }

  @RequireRoles('operations')
  @Implement(contract.admin.teams.create)
  create(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.teams.create).handler(({ input, errors }) =>
      withContractErrors(errors, () => this.teams.create(adminActor(auth, meta), input)),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.teams.update)
  update(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.teams.update).handler(({ input, errors }) =>
      orNotFound('Team', () =>
        withContractErrors(errors, () => this.teams.update(adminActor(auth, meta), input)),
      ),
    );
  }
}

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminLeaguesController {
  constructor(private readonly leagues: LeaguesService) {}

  @Implement(contract.admin.leagues.list)
  list() {
    return implement(contract.admin.leagues.list).handler(async () => ({
      items: await this.leagues.list(),
    }));
  }

  @Implement(contract.admin.leagues.get)
  get() {
    return implement(contract.admin.leagues.get).handler(({ input }) =>
      orNotFound('League', () => this.leagues.get(input.id)),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.leagues.create)
  create(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.leagues.create).handler(({ input, errors }) =>
      withContractErrors(errors, () => this.leagues.create(adminActor(auth, meta), input)),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.leagues.update)
  update(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.leagues.update).handler(({ input, errors }) =>
      orNotFound('League', () =>
        withContractErrors(errors, () => this.leagues.update(adminActor(auth, meta), input)),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.leagues.setTeams)
  setTeams(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.leagues.setTeams).handler(({ input, errors }) =>
      orNotFound('League or team', () =>
        withContractErrors(errors, () =>
          this.leagues.setTeams(adminActor(auth, meta), input.id, input.teamIds),
        ),
      ),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.leagues.activate)
  activate(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.leagues.activate).handler(({ input, errors }) =>
      orNotFound('League', () =>
        withContractErrors(errors, () => this.leagues.activate(adminActor(auth, meta), input.id)),
      ),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.leagues.setJackpotClose)
  setJackpotClose(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.leagues.setJackpotClose).handler(({ input, errors }) =>
      orNotFound('League', () =>
        withContractErrors(errors, () =>
          this.leagues.setJackpotClose(adminActor(auth, meta), input.id, input.date, input.time),
        ),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.leagues.createDays)
  createDays(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.leagues.createDays).handler(({ input, errors }) =>
      orNotFound('League', () =>
        withContractErrors(errors, () =>
          this.leagues.createDays(adminActor(auth, meta), input.id, input.dates),
        ),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.leagues.importFixtures)
  importFixtures(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.leagues.importFixtures).handler(({ input, errors }) =>
      orNotFound('League', () =>
        withContractErrors(errors, () =>
          this.leagues.importFixtures(adminActor(auth, meta), input.id, input.csv, input.commit),
        ),
      ),
    );
  }
}

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminDaysController {
  constructor(private readonly days: DaysService) {}

  @Implement(contract.admin.days.list)
  list() {
    return implement(contract.admin.days.list).handler(async ({ input }) => ({
      items: await this.days.list(input.leagueId, input.status),
    }));
  }

  @Implement(contract.admin.days.get)
  get() {
    return implement(contract.admin.days.get).handler(({ input }) =>
      orNotFound('Match-day', () => this.days.get(input.id)),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.update)
  update(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.update).handler(({ input, errors }) => {
      // Scheduling an automatic opening is the same power as opening by hand.
      if (input.opensAt !== undefined && auth.role !== 'super_admin') {
        throw new ForbiddenException('Only a super admin can schedule a day to open.');
      }
      return orNotFound('Match-day', () =>
        withContractErrors(errors, () => this.days.update(adminActor(auth, meta), input)),
      );
    });
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.addMatch)
  addMatch(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.addMatch).handler(({ input, errors }) =>
      orNotFound('Match-day', () =>
        withContractErrors(errors, () => this.days.addMatch(adminActor(auth, meta), input)),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.updateMatch)
  updateMatch(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.updateMatch).handler(({ input, errors }) =>
      orNotFound('Match', () =>
        withContractErrors(errors, () => this.days.updateMatch(adminActor(auth, meta), input)),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.removeMatch)
  removeMatch(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.removeMatch).handler(({ input, errors }) =>
      orNotFound('Match', () =>
        withContractErrors(errors, () => this.days.removeMatch(adminActor(auth, meta), input.id)),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.publish)
  publish(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.publish).handler(({ input, errors }) =>
      orNotFound('Match-day', () =>
        withContractErrors(errors, () => this.days.publish(adminActor(auth, meta), input.id)),
      ),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.days.open)
  open(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.open).handler(({ input, errors }) =>
      orNotFound('Match-day', () =>
        withContractErrors(errors, () => this.days.open(adminActor(auth, meta), input.id)),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.close)
  close(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.close).handler(({ input, errors }) =>
      orNotFound('Match-day', () =>
        withContractErrors(errors, () => this.days.close(adminActor(auth, meta), input.id)),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.markStarted)
  markStarted(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.markStarted).handler(({ input, errors }) =>
      orNotFound('Match', () =>
        withContractErrors(errors, () =>
          this.days.markStarted(adminActor(auth, meta), input.id, input.startedAt, input.reason),
        ),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.voidMatch)
  voidMatch(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.voidMatch).handler(({ input, errors }) =>
      orNotFound('Match', () =>
        withContractErrors(errors, () =>
          this.days.voidMatch(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.reschedule)
  reschedule(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.reschedule).handler(({ input, errors }) =>
      orNotFound('Match', () =>
        withContractErrors(errors, () =>
          this.days.reschedule(adminActor(auth, meta), input.id, input.time, input.reason),
        ),
      ),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.days.reopenMatch)
  reopenMatch(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.days.reopenMatch).handler(({ input, errors }) =>
      orNotFound('Match', () =>
        withContractErrors(errors, () =>
          this.days.reopenMatch(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }
}

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Implement(contract.admin.settings.get)
  get() {
    return implement(contract.admin.settings.get).handler(() => this.settings.get());
  }

  @RequireRoles()
  @Implement(contract.admin.settings.update)
  update(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.settings.update).handler(({ input }) =>
      this.settings.update({ type: 'admin', id: auth.adminId, ip: meta.ip }, input),
    );
  }
}

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminStandingsController {
  constructor(private readonly standings: StandingsService) {}

  @Implement(contract.admin.standings.get)
  get() {
    return implement(contract.admin.standings.get).handler(({ input }) =>
      orNotFound('League', () => this.standings.get(input.id)),
    );
  }

  @RequireRoles('operations')
  @Implement(contract.admin.standings.save)
  save(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.standings.save).handler(({ input, errors }) =>
      orNotFound('League', () =>
        withContractErrors(errors, () =>
          this.standings.save(adminActor(auth, meta), input.id, input.category, input.rows),
        ),
      ),
    );
  }

  @Implement(contract.admin.standings.fromResults)
  fromResults() {
    return implement(contract.admin.standings.fromResults).handler(({ input }) =>
      orNotFound('League', async () => ({
        rows: await this.standings.fromResults(input.id, input.category),
      })),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.standings.finalize)
  finalize(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.standings.finalize).handler(({ input, errors }) =>
      orNotFound('League', () =>
        withContractErrors(errors, () => this.standings.finalize(adminActor(auth, meta), input.id)),
      ),
    );
  }
}
