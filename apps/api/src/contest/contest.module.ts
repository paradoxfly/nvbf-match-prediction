import { Global, Module } from '@nestjs/common';
import { ContestReadService } from './contest-read.service';
import { TtlCache } from './ttl-cache';

/** Shared read models for every contest feature. */
@Global()
@Module({
  providers: [ContestReadService, TtlCache],
  exports: [ContestReadService, TtlCache],
})
export class ContestModule {}
