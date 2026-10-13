import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@predict/contracts';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Implement(contract.system.health)
  healthCheck() {
    return implement(contract.system.health).handler(() => this.health.check());
  }
}
