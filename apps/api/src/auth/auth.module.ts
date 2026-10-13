import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminAuthGuard, UserAuthGuard } from './guards';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, OtpService, SessionService, TokenService, UserAuthGuard, AdminAuthGuard],
  exports: [SessionService, TokenService, UserAuthGuard, AdminAuthGuard],
})
export class AuthModule {}
