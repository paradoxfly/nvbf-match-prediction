import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import { withContractErrors } from '../common/domain-error';
import { orNotFound } from '../common/not-found';
import { CurrentAuth, UserAuthGuard } from '../auth/guards';
import type { UserAuth } from '../auth/realm';
import { EntriesService } from './entries.service';

@Controller()
@UseGuards(UserAuthGuard)
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Implement(contract.entries.myDay)
  myDay(@CurrentAuth() auth: UserAuth) {
    return implement(contract.entries.myDay).handler(({ input }) =>
      orNotFound('Match-day', () => this.entries.myDay(auth.userId, input.date)),
    );
  }

  @Implement(contract.entries.join)
  join(@CurrentAuth() auth: UserAuth) {
    return implement(contract.entries.join).handler(({ input, errors }) =>
      orNotFound('Match-day', () =>
        withContractErrors(errors, () => this.entries.join(auth.userId, input.date)),
      ),
    );
  }

  @Implement(contract.entries.submitClaim)
  submitClaim(@CurrentAuth() auth: UserAuth) {
    return implement(contract.entries.submitClaim).handler(({ input, errors }) =>
      orNotFound('Entry', () =>
        withContractErrors(errors, () => this.entries.submitClaim(auth.userId, input)),
      ),
    );
  }

  @Implement(contract.entries.myEntries)
  myEntries(@CurrentAuth() auth: UserAuth) {
    return implement(contract.entries.myEntries).handler(async () => ({
      items: await this.entries.myEntries(auth.userId),
    }));
  }
}
