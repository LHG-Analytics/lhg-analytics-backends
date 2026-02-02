/**
 * Serviço de conexão com banco de dados usando node-postgres (pg)
 * Para queries diretas sem Prisma - melhor performance
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';

@Injectable()
export class PgPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgPoolService.name);
  private pool: Pool | null = null;

  async onModuleInit() {
    await this.initializePool();
  }

  async onModuleDestroy() {
    await this.closePool();
  }

  /**
   * Inicializa o pool de conexão
   */
  private async initializePool(): Promise<void> {
    const connectionString = process.env.DATABASE_URL_LOCAL_IPIRANGA;

    if (!connectionString) {
      throw new Error('DATABASE_URL_LOCAL_IPIRANGA não configurada');
    }

    try {
      const config: PoolConfig = {
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      };

      this.pool = new Pool(config);

      // Testa a conexão
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.logger.log('Pool de conexão inicializado');
    } catch (error) {
      this.logger.error(`Erro ao conectar: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Fecha o pool de conexão
   */
  private async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.logger.log('Pool de conexão fechado');
    }
  }

  /**
   * Executa uma query SQL
   */
  async query<T = any>(sql: string): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Pool de conexão não disponível');
    }

    try {
      const result = await this.pool.query(sql);
      return result.rows as T[];
    } catch (error) {
      this.logger.error(`Erro na query: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Executa uma query SQL com parâmetros
   */
  async queryWithParams<T = any>(sql: string, params: any[]): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Pool de conexão não disponível');
    }

    try {
      const result = await this.pool.query(sql, params);
      return result.rows as T[];
    } catch (error) {
      this.logger.error(`Erro na query: ${(error as Error).message}`);
      throw error;
    }
  }
}
