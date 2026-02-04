import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma/prisma.service';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from './cache/cache.module';
import { DatabaseModule } from './database/database.module';
import { UtilsModule } from './utils/utils.module';
import { ValidationModule, QueryUtilsModule, ConcurrencyUtilsModule, CompressionUtilsModule } from '@lhg/utils';
import { CompanyModule } from './company/company.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { BookingsModule } from './bookings/bookings.module';
import { GovernanceModule } from './governance/governance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute (global)
      },
    ]),
    CacheModule,
    DatabaseModule,
    UtilsModule,
    ValidationModule,
    QueryUtilsModule,
    ConcurrencyUtilsModule,
    CompressionUtilsModule,
    CompanyModule,
    RestaurantModule,
    BookingsModule,
    GovernanceModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
