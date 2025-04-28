import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { PrismaService } from "./prisma/prisma.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // Carrega variáveis do .env globalmente
    UsersModule,
    AuthModule,
  ],
  providers: [
    PrismaService, // Prisma conectado no Supabase de users
  ],
})
export class AppModule {}
