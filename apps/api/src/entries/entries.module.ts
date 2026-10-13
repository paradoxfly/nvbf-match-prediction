import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [EntriesController],
  providers: [EntriesService],
  exports: [EntriesService],
})
export class EntriesModule {}
