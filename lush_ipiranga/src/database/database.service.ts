/**
 * Serviço de conexão PostgreSQL usando pg (node-postgres)
 * Conexão direta sem Prisma para melhor performance
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

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
   * Inicializa pool de conexão PostgreSQL
   */
  private async initializePool(): Promise<void> {
    const connectionString = process.env.DATABASE_URL_LOCAL_IPIRANGA;

    if (!connectionString) {
      throw new Error('DATABASE_URL_LOCAL_IPIRANGA não configurado nas variáveis de ambiente');
    }

    try {
      this.pool = new Pool({
        connectionString,
        max: 5, // Máximo de conexões no pool
        idleTimeoutMillis: 30000, // Timeout de conexões ociosas
        connectionTimeoutMillis: 10000, // Timeout para estabelecer conexão
      });

      // Testa a conexão
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.logger.log('Pool de conexão PostgreSQL inicializado para Lush Ipiranga');
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Erro ao conectar ao PostgreSQL: ${err.message}`);
      throw error;
    }
  }

  /**
   * Fecha o pool de conexão
   */
  private async closePool(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        this.logger.log('Pool de conexão PostgreSQL fechado');
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Erro ao fechar pool: ${err.message}`);
      }
    }
  }

  /**
   * Executa uma query SQL direta
   * @param sql Query SQL (pode usar interpolação de string)
   * @returns Resultado da query com rows
   */
  async query<T = any>(sql: string): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Pool de conexão não inicializado');
    }

    try {
      const result = await this.pool.query(sql);
      return result.rows as T[];
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Erro na query SQL: ${err.message}`);
      this.logger.error(`SQL: ${sql.substring(0, 200)}...`);
      throw error;
    }
  }

  /**
   * Verifica se o pool está conectado
   */
  isConnected(): boolean {
    return this.pool !== null;
  }

  /**
   * Obtém o pool para uso direto (se necessário)
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Pool de conexão não inicializado');
    }
    return this.pool;
  }
}
