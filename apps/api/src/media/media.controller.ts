import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import { withContractErrors } from '../common/domain-error';
import { orNotFound } from '../common/not-found';
import { AdminAuthGuard, CurrentAuth } from '../auth/guards';
import type { AdminAuth } from '../auth/realm';
import { MediaService } from './media.service';

@Controller()
@UseGuards(AdminAuthGuard)
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Implement(contract.admin.media.createUpload)
  createUpload(@CurrentAuth() auth: AdminAuth) {
    return implement(contract.admin.media.createUpload).handler(({ input, errors }) =>
      withContractErrors(errors, () => this.media.createUpload(auth.adminId, input)),
    );
  }

  @Implement(contract.admin.media.confirm)
  confirm() {
    return implement(contract.admin.media.confirm).handler(({ input, errors }) =>
      orNotFound('File', () => withContractErrors(errors, () => this.media.confirm(input.id))),
    );
  }
}
