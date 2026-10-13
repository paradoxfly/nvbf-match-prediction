import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminJackpotController, JackpotController } from './jackpot.controller';
import { JackpotService } from './jackpot.service';

@Module({
  imports: [AuthModule],
  controllers: [JackpotController, AdminJackpotController],
  providers: [JackpotService],
})
export class JackpotModule {}
