import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import { withContractErrors } from '../common/domain-error';
import { orNotFound } from '../common/not-found';
import { PublicService } from './public.service';

/** Open to everyone. Nothing here may expose phone numbers or bank details. */
@Controller()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Implement(contract.public.home)
  home() {
    return implement(contract.public.home).handler(() => this.publicService.home());
  }

  @Implement(contract.public.day)
  day() {
    return implement(contract.public.day).handler(({ input }) =>
      orNotFound('Match-day', () => this.publicService.day(input.date)),
    );
  }

  @Implement(contract.public.rules)
  rules() {
    return implement(contract.public.rules).handler(({ input }) =>
      this.publicService.rules(input.date),
    );
  }

  @Implement(contract.public.standings)
  standings() {
    return implement(contract.public.standings).handler(({ errors }) =>
      withContractErrors(errors, () => this.publicService.standings()),
    );
  }
}
