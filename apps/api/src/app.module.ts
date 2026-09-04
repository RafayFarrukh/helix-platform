import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { CorrelationMiddleware } from './shared/http/middleware/correlation.middleware';
import { ProblemDetailsFilter } from './shared/http/filters/problem.filter';
import { AuthGuard } from './shared/http/guards/auth.guard';
import { PermissionGuard } from './shared/http/guards/permission.guard';

import { EventsModule } from './platform/events/events.module';
import { PlatformModule } from './platform/platform.module';
import { TenantGuard } from './platform/tenancy/tenant.guard';
import { RateLimitGuard } from './platform/rate-limit/rate-limit.guard';
import { AuditInterceptor } from './platform/audit/audit.interceptor';

import { CalendarModule } from './products/calendar/calendar.module';
import { MeetModule } from './products/meet/meet.module';
import { DriveModule } from './products/drive/drive.module';
import { NotesModule } from './products/notes/notes.module';

/**
 * The composition root.
 *
 * Read the guard list top to bottom and you have the platform's security model:
 *   authenticate → resolve tenant → rate limit → entitlement + permission → audit
 *
 * Every request to every one of the 100+ products passes through all five. A
 * product cannot opt out, which is exactly the property you want when many teams
 * ship into one platform.
 *
 * Adding product #101 means adding one line to the product list below — the
 * generator (`pnpm gen:product`) writes it for you.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    EventsModule,
    PlatformModule,

    // ---- Products -------------------------------------------------------
    CalendarModule,
    MeetModule,
    DriveModule,
    NotesModule,
    // ...products 4 → 100+ are added here, each self-contained in src/products/*
  ],
  providers: [
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }) },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
