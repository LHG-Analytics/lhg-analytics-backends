/**
 * Serviço de conexão com banco de dados usando node-postgres (pg)
 * Para queries diretas sem Prisma - melhor performance
 * Inicialização preguiçosa (lazy) para não travar o bootstrap
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';

@Injectable()
export class PgPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(PgPoolService.name);
  private pool: Pool | null = null;
  private initialized = false;

  /**
   * Inicializa o pool de conexão de forma preguiçosa (lazy)
   * Só conecta quando realmente precisar usar
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.initializePool();
    this.initialized = true;
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
        max: 5, // Reduzido para evitar estourar limite de conexões no Render
        idleTimeoutMillis: 30000, // 30 segundos - libera conexões mais rápido
        connectionTimeoutMillis: 10000,
        statement_timeout: 120000, // 2 minutos por query
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
    await this.ensureInitialized();

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
    await this.ensureInitialized();

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
