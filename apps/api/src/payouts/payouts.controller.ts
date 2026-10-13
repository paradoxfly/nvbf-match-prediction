import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract, NIGERIAN_BANKS } from '@predict/contracts';
import { adminActor } from '../common/actor';
import { withContractErrors } from '../common/domain-error';
import { orNotFound } from '../common/not-found';
import {
  AdminAuthGuard,
  ClientInfo,
  CurrentAuth,
  RequireRoles,
  UserAuthGuard,
} from '../auth/guards';
import type { AdminAuth, UserAuth } from '../auth/realm';
import type { ClientMeta } from '../auth/session.service';
import { ObligationsService } from './obligations.service';

@Controller()
export class PayoutsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Implement(contract.payouts.banks)
  banks() {
    return implement(contract.payouts.banks).handler(() => ({ items: [...NIGERIAN_BANKS] }));
  }

  @UseGuards(UserAuthGuard)
  @Implement(contract.payouts.myAccount)
  myAccount(@CurrentAuth() auth: UserAuth) {
    return implement(contract.payouts.myAccount).handler(() =>
      this.obligations.myAccount(auth.userId),
    );
  }

  @UseGuards(UserAuthGuard)
  @Implement(contract.payouts.saveAccount)
  saveAccount(@CurrentAuth() auth: UserAuth) {
    return implement(contract.payouts.saveAccount).handler(({ input, errors }) =>
      withContractErrors(errors, () => this.obligations.saveAccount(auth.userId, input)),
    );
  }

  @UseGuards(UserAuthGuard)
  @Implement(contract.payouts.cancelPendingAccount)
  cancelPendingAccount(@CurrentAuth() auth: UserAuth) {
    return implement(contract.payouts.cancelPendingAccount).handler(() =>
      this.obligations.cancelPendingAccount(auth.userId),
    );
  }

  @UseGuards(UserAuthGuard)
  @Implement(contract.payouts.myObligations)
  myObligations(@CurrentAuth() auth: UserAuth) {
    return implement(contract.payouts.myObligations).handler(async () => ({
      items: await this.obligations.myObligations(auth.userId),
    }));
  }
}

@Controller()
@UseGuards(AdminAuthGuard)
@RequireRoles('finance')
export class AdminPayoutsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Implement(contract.admin.payouts.list)
  list() {
    return implement(contract.admin.payouts.list).handler(({ input }) =>
      this.obligations.list(input),
    );
  }

  @Implement(contract.admin.payouts.revealAccount)
  revealAccount(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payouts.revealAccount).handler(({ input, errors }) =>
      orNotFound('Payout', () =>
        withContractErrors(errors, () =>
          this.obligations.revealAccount(adminActor(auth, meta), input.id),
        ),
      ),
    );
  }

  @Implement(contract.admin.payouts.start)
  start(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payouts.start).handler(({ input, errors }) =>
      orNotFound('Payout', () =>
        withContractErrors(errors, () =>
          this.obligations.start(adminActor(auth, meta), input.id, input.nameEnquiryName),
        ),
      ),
    );
  }

  @Implement(contract.admin.payouts.markPaid)
  markPaid(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payouts.markPaid).handler(({ input, errors }) =>
      orNotFound('Payout', () =>
        withContractErrors(errors, () =>
          this.obligations.markPaid(
            adminActor(auth, meta),
            input.id,
            input.transferReference,
            input.amountKobo,
          ),
        ),
      ),
    );
  }

  @Implement(contract.admin.payouts.markFailed)
  markFailed(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payouts.markFailed).handler(({ input, errors }) =>
      orNotFound('Payout', () =>
        withContractErrors(errors, () =>
          this.obligations.markFailed(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }

  @Implement(contract.admin.payouts.invalidDetails)
  invalidDetails(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payouts.invalidDetails).handler(({ input, errors }) =>
      orNotFound('Payout', () =>
        withContractErrors(errors, () =>
          this.obligations.invalidDetails(adminActor(auth, meta), input.id, input.reason),
        ),
      ),
    );
  }

  @RequireRoles()
  @Implement(contract.admin.payouts.hold)
  hold(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payouts.hold).handler(({ input, errors }) =>
      orNotFound('Payout', () =>
        withContractErrors(errors, () =>
          this.obligations.hold(adminActor(auth, meta), input.id, input.reason, input.hold),
        ),
      ),
    );
  }

  @Implement(contract.admin.payouts.refundTransfer)
  refundTransfer(@CurrentAuth() auth: AdminAuth, @ClientInfo() meta: ClientMeta) {
    return implement(contract.admin.payouts.refundTransfer).handler(({ input, errors }) =>
      orNotFound('Transfer', () =>
        withContractErrors(errors, () =>
          this.obligations.refundTransfer(
            adminActor(auth, meta),
            input.id,
            input.reason,
            input.userId,
          ),
        ),
      ),
    );
  }
}
