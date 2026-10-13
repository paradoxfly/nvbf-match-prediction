import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminStaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminStaffController],
  providers: [StaffService],
})
export class StaffModule {}
