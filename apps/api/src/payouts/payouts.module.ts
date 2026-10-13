import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ObligationsService } from './obligations.service';
import { AdminPayoutsController, PayoutsController } from './payouts.controller';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PayoutsController, AdminPayoutsController],
  providers: [ObligationsService],
  exports: [ObligationsService],
})
export class PayoutsModule {}
