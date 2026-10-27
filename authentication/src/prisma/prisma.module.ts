import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global e único dono do PrismaService: toda a aplicação compartilha o MESMO
// PrismaClient (um só pool de conexões). Não registre PrismaService em
// `providers` de outros módulos; basta injetá-lo.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
