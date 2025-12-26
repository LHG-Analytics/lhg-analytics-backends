import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient as PrismaClientLocal } from '@client-local';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public prismaLocal: PrismaClientLocal;

  constructor() {
    this.prismaLocal = new PrismaClientLocal({
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
  }

  async onModuleDestroy() {
    await this.prismaLocal.$disconnect();
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
