import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Module({
  providers: [PrismaService],
  exports: [PrismaService], // Exporta o PrismaService para que outros módulos usem
})
export class PrismaModule {}
