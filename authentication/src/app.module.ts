import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HelpdeskModule } from './helpdesk/helpdesk.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { AccessModule } from './access/access.module';
import { InvitationsModule } from './invitations/invitations.module';

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
    AccessModule,
    UsersModule,
    AuthModule,
    HelpdeskModule,
    InvitationsModule,
    HealthModule,
  ],
  // O PrismaService vem SÓ do PrismaModule (global): um único PrismaClient e um
  // único pool de conexões com o banco de usuários. Antes ele também era
  // registrado aqui, o que criava uma 2ª instância conectada e sem uso.
  providers: [
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
