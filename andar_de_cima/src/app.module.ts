import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { DatabaseModule } from './database/database.module';
import { CompanyModule } from './company/company.module';
import { GovernanceModule } from './governance/governance.module';
import { BookingsModule } from './bookings/bookings.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { CacheModule } from './cache/cache.module';
import { AuthModule } from './auth/auth.module';
import {
  DateUtilsModule,
  ValidationModule,
  QueryUtilsModule,
  ConcurrencyUtilsModule,
  CompressionUtilsModule,
} from '@lhg/utils';

@Module({
  imports: [
    DateUtilsModule, // Utilitários compartilhados de data
    ValidationModule, // Utilitários compartilhados de validação
    QueryUtilsModule, // Utilitários compartilhados de query
    ConcurrencyUtilsModule, // Utilitários de controle de concorrência
    CompressionUtilsModule, // Utilitários de compressão HTTP
    CacheModule, // Módulo de cache para KPIs real-time
    DatabaseModule, // Módulo de conexão direta com PostgreSQL (pg)
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    PrismaModule,
    AuthModule,
    CompanyModule,
    GovernanceModule,
    BookingsModule,
    RestaurantModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    //{
    //provide: APP_GUARD,
    // useClass: JwtAuthGuard, // Aplicado o guard de autenticação globalmente
    // },
  ],
})
export class AppModule {}
