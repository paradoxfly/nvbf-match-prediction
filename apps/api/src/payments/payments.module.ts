import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContributionsService } from './contributions.service';
import { AdminContributionsController, AdminPaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AdminPaymentsController, AdminContributionsController],
  providers: [PaymentsService, ContributionsService],
  exports: [PaymentsService, ContributionsService],
})
export class PaymentsModule {}
