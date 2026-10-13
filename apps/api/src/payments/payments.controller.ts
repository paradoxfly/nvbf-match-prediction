import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import { adminActor } from '../common/actor';
import { withContractErrors } from '../common/domain-error';
import { orNotFound } from '../common/not-found';
import { AdminAuthGuard, ClientInfo, CurrentAuth, RequireRoles } from '../auth/guards';
import type { AdminAuth } from '../auth/realm';
import type { ClientMeta } from '../auth/session.service';
import { ContributionsService } from './contributions.service';
import { PaymentsService } from './payments.service';

@Controller()
@UseGuards(AdminAuthGuard)
@RequireRoles('finance')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Implement(contract.admin.payments.queue)
  queue() {
    return implement(contract.admin.payments.queue).handler(({ input }) =>
      this.payments.queue(input),
    );
  }

  @Implement(contract.admin.payments.confirm)
  confirm(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payments.confirm).handler(({ input, errors }) =>
      orNotFound('Entry', () =>
        withContractErrors(errors, () =>
          this.payments.confirm(adminActor(auth, meta), input.id, input.transfer),
        ),
      ),
    );
  }

  @Implement(contract.admin.payments.rejectClaim)
  rejectClaim(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payments.rejectClaim).handler(({ input, errors }) =>
      orNotFound('Entry', () =>
        withContractErrors(errors, () =>
          this.payments.rejectClaim(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.payments.revoke)
  revoke(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payments.revoke).handler(({ input, errors }) =>
      orNotFound('Entry', () =>
        withContractErrors(errors, () =>
          this.payments.revoke(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.payments.disqualify)
  disqualify(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payments.disqualify).handler(({ input, errors }) =>
      orNotFound('Entry', () =>
        withContractErrors(errors, () =>
          this.payments.disqualify(adminActor(auth, meta), input.id, input.reason, input.undo),
        ),
      ),
    );
  }

  @Implement(contract.admin.payments.transfers)
  transfers() {
    return implement(contract.admin.payments.transfers).handler(({ input }) =>
      this.payments.transfers(input),
    );
  }

  @Implement(contract.admin.payments.recordTransfer)
  recordTransfer(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payments.recordTransfer).handler(({ input, errors }) =>
      withContractErrors(errors, () => this.payments.recordTransfer(adminActor(auth, meta), input)),
    );
  }

  @Implement(contract.admin.payments.voidTransfer)
  voidTransfer(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payments.voidTransfer).handler(({ input, errors }) =>
      orNotFound('Transfer', () =>
        withContractErrors(errors, () =>
          this.payments.voidTransfer(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }
}

@Controller()
@UseGuards(AdminAuthGuard)
@RequireRoles('finance')
export class AdminContributionsController {
  constructor(private readonly contributions: ContributionsService) {}

  @Implement(contract.admin.contributions.list)
  list() {
    return implement(contract.admin.contributions.list).handler(async ({ input }) => ({
      items: await this.contributions.list(input),
    }));
  }

  @Implement(contract.admin.contributions.create)
  create(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.contributions.create).handler(({ input, errors }) =>
      orNotFound('Match-day or jackpot', () =>
        withContractErrors(errors, () => this.contributions.create(adminActor(auth, meta), input)),
      ),
    );
  }

  @Implement(contract.admin.contributions.allocate)
  allocate(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.contributions.allocate).handler(({ input, errors }) =>
      orNotFound('Contribution', () =>
        withContractErrors(errors, () =>
          this.contributions.allocate(adminActor(auth, meta), input.id),
        ),
      ),
    );
  }

  @Implement(contract.admin.contributions.return)
  returnContribution(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.contributions.return).handler(({ input, errors }) =>
      orNotFound('Contribution', () =>
        withContractErrors(errors, () =>
          this.contributions.returnContribution(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }
}
