import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminMediaController } from './media.controller';
import { MediaService } from './media.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AdminMediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
