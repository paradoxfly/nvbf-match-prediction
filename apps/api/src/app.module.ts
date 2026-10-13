import './common/orpc-context';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ORPCModule } from '@orpc/nest';
import { ResponseHeadersPlugin } from '@orpc/server/plugins';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ClientHeaderGuard } from './common/client-header.guard';
import { CommonModule } from './common/common.module';
import { ContestModule } from './contest/contest.module';
import { loggerParams } from './common/logger';
import { ConfigModule, ENV } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './database/database.module';
import { EntriesModule } from './entries/entries.module';
import { HealthModule } from './health/health.module';
import { JackpotModule } from './jackpot/jackpot.module';
import { LedgerModule } from './ledger/ledger.module';
import { MediaModule } from './media/media.module';
import { PaymentsModule } from './payments/payments.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PredictionsModule } from './predictions/predictions.module';
import { PublicModule } from './public/public.module';
import { RedisModule } from './redis/redis.module';
import { ResultsModule } from './results/results.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SetupModule } from './setup/setup.module';
import { EmailModule } from './email/email.module';
import { StaffModule } from './staff/staff.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => loggerParams(env) }),
    // `context` must be an object: plugins spread it into a fresh per-request context.
    ORPCModule.forRoot({ context: {}, plugins: [new ResponseHeadersPlugin()] }),
    DatabaseModule,
    RedisModule,
    CommonModule,
    EmailModule,
    StorageModule.register(),
    HealthModule,
    AuthModule,
    AdminModule,
    MediaModule,
    ContestModule,
    LedgerModule,
    SetupModule,
    PublicModule,
    EntriesModule,
    PaymentsModule,
    PayoutsModule,
    PredictionsModule,
    ResultsModule,
    JackpotModule,
    StaffModule,
    SchedulerModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ClientHeaderGuard },
  ],
})
export class AppModule {}
