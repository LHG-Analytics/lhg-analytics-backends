import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient as PrismaClientLocal } from '@client-local';
import { PrismaClient as PrismaClientOnline } from '@client-online';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public prismaLocal: PrismaClientLocal;
  public prismaOnline: PrismaClientOnline;

  constructor() {
    this.prismaLocal = new PrismaClientLocal({
      log: ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL_LOCAL + '?connection_limit=10&pool_timeout=60&connect_timeout=60'
        }
      }
    });
    this.prismaOnline = new PrismaClientOnline({
      log: ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL_ONLINE + '?connection_limit=10&pool_timeout=60&connect_timeout=60'
        }
      }
    });
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
