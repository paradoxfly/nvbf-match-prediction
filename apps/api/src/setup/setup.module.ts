import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DaysService } from './days.service';
import { LeaguesService } from './leagues.service';
import {
  AdminDaysController,
  AdminLeaguesController,
  AdminSettingsController,
  AdminStandingsController,
  AdminTeamsController,
} from './setup.controller';
import { SettingsService } from './settings.service';
import { StandingsService } from './standings.service';
import { TeamsService } from './teams.service';

/** Staff setup: teams, leagues, match-days, fixtures, standings and settings. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [
    AdminTeamsController,
    AdminLeaguesController,
    AdminDaysController,
    AdminSettingsController,
    AdminStandingsController,
  ],
  providers: [TeamsService, LeaguesService, DaysService, SettingsService, StandingsService],
  exports: [DaysService, SettingsService, StandingsService, LeaguesService],
})
export class SetupModule {}
