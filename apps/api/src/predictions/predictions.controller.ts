import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import { withContractErrors } from '../common/domain-error';
import { orNotFound } from '../common/not-found';
import { CurrentAuth, UserAuthGuard } from '../auth/guards';
import type { UserAuth } from '../auth/realm';
import { PredictionsService } from './predictions.service';

@Controller()
@UseGuards(UserAuthGuard)
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Implement(contract.predictions.save)
  save(@CurrentAuth() auth: UserAuth) {
    return implement(contract.predictions.save).handler(({ input, errors }) =>
      orNotFound('Match-day', () =>
        withContractErrors(errors, () => this.predictions.save(auth.userId, input)),
      ),
    );
  }
}
