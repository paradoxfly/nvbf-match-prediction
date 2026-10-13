import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { EncryptionService } from './encryption.service';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  providers: [RateLimitService, AuditService, EncryptionService],
  exports: [RateLimitService, AuditService, EncryptionService],
})
export class CommonModule {}
