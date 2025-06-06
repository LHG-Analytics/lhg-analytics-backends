import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient as PrismaClientLocal } from '@client-local';
import { PrismaClient as PrismaClientOnline } from '@client-online';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public prismaLocal: PrismaClientLocal;
  public prismaOnline: PrismaClientOnline;

  constructor() {
    this.prismaLocal = new PrismaClientLocal();
    this.prismaOnline = new PrismaClientOnline();
  }

  async onModuleInit() {
    await this.prismaLocal.$connect();
    await this.prismaOnline.$connect();
  }

  async onModuleDestroy() {
    await this.prismaLocal.$disconnect();
    await this.prismaOnline.$disconnect();
  }

  // Método para reutilizar uma conexão
  async executeQuery(query: () => Promise<any>) {
    try {
      return await query();
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }
}
