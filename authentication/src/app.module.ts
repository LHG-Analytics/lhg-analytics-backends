import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HelpdeskModule } from './helpdesk/helpdesk.module';
import { PrismaService } from './prisma/prisma.service';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// NOTA (limpeza pós-migração multi-tenant, 2026-07-25): os módulos de KPI
// (company/bookings/governance/restaurant) e sua infra (cache/database/utils)
// migraram para o lhg-api (inclusive a visão Consolidated). Este serviço agora
// responde SOMENTE por autenticação e usuários (login/refresh/logout/me/users),
// mais o token curto do widget do LHG Help Desk (GET /api/helpdesk/token).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute (global)
      },
    ]),
    UsersModule,
    AuthModule,
    HelpdeskModule,
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
