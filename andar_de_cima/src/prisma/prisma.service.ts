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
    });
    this.prismaOnline = new PrismaClientOnline({
      log: ['error'],
    });
  }

  async onModuleInit() {
    try {
      console.log('Conectando ao banco LOCAL...');
      await this.prismaLocal.$connect();
      console.log('✅ Conexão LOCAL estabelecida com sucesso');
    } catch (error) {
      console.error('❌ Erro ao conectar ao banco LOCAL:', error);
      throw error;
    }

    try {
      console.log('Conectando ao banco ONLINE...');
      await this.prismaOnline.$connect();
      console.log('✅ Conexão ONLINE estabelecida com sucesso');
    } catch (error) {
      console.error(
        '⚠️ Erro ao conectar ao banco ONLINE (servidor continuará apenas com LOCAL):',
        error.message,
      );
    }
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
