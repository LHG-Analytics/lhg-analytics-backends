import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient as PrismaClientOnline } from "../../dist/generated/client-online";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public prismaOnline: PrismaClientOnline;

  constructor() {
    this.prismaOnline = new PrismaClientOnline();
  }

  async onModuleInit() {
    await this.prismaOnline.$connect();
  }

  async onModuleDestroy() {
    await this.prismaOnline.$disconnect();
  }

  // Método para reutilizar uma conexão
  async executeQuery(query: () => Promise<any>) {
    try {
      return await query();
    } catch (error) {
      console.error("Error executing query:", error);
      throw error;
    }
  }
}
