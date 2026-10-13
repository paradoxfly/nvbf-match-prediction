import { Global, Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Global()
@Module({
  controllers: [PublicController],
  providers: [PublicService],
  exports: [PublicService],
})
export class PublicModule {}
