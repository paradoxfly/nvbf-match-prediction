import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeaderboardService } from './leaderboard.service';
import { AdminResultsController, LeaderboardController } from './results.controller';
import { ResultsService } from './results.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [LeaderboardController, AdminResultsController],
  providers: [LeaderboardService, ResultsService],
  exports: [LeaderboardService, ResultsService],
})
export class ResultsModule {}
