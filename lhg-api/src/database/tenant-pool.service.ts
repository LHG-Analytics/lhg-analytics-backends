/**
 * Pools de conexão PostgreSQL por unidade (multi-tenant).
 * Um Pool `pg` por tenant, criado lazy no primeiro uso, com o MESMO perfil dos
 * backends atuais (max 5, idle 30s, statement_timeout 2min — tunado para Render).
 * Padrão herdado do authentication/src/database (o mini multi-tenant do Consolidated).
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import { getTenant } from '../tenant/tenant.registry';

@Injectable()
export class TenantPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(TenantPoolService.name);
  private pools = new Map<string, Pool>();

  private getPool(slug: string): Pool {
    const existing = this.pools.get(slug);
    if (existing) return existing;

    const tenant = getTenant(slug);
    if (!tenant) throw new Error(`Tenant desconhecido: ${slug}`);

    const connectionString = process.env[tenant.databaseUrlEnv];
    if (!connectionString) {
      throw new Error(`${tenant.databaseUrlEnv} não configurada para a unidade ${slug}`);
    }

    const config: PoolConfig = {
      connectionString,
      // Cada request de KPI dispara muitas queries em paralelo num Promise.all
      // (restaurant=16, company~22). Com pool de 5, faixas grandes (ex.: 13 meses)
      // deixam as queries excedentes na fila e elas estouram o connectionTimeout
      // → "timeout exceeded when trying to connect". Os bancos AUTOMO das unidades
      // têm folga (max_connections 100–300, uso ~7), então subimos o teto para
      // caber o Promise.all inteiro em paralelo. connectionTimeout maior serve de
      // rede: o corte real por query continua no statement_timeout (2min).
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
      statement_timeout: 120000,
    };

    const pool = new Pool(config);
    pool.on('error', (err) => this.logger.error(`Pool ${slug}: ${err.message}`));
    this.pools.set(slug, pool);
    this.logger.log(`Pool de conexão criado para ${slug}`);
    return pool;
  }

  async query<T = any>(slug: string, sql: string): Promise<T[]> {
    try {
      const result = await this.getPool(slug).query(sql);
      return result.rows as T[];
    } catch (error) {
      this.logger.error(`[${slug}] Erro na query: ${(error as Error).message}`);
      throw error;
    }
  }

  async queryWithParams<T = any>(slug: string, sql: string, params: any[]): Promise<T[]> {
    try {
      const result = await this.getPool(slug).query(sql, params);
      return result.rows as T[];
    } catch (error) {
      this.logger.error(`[${slug}] Erro na query: ${(error as Error).message}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    for (const [slug, pool] of this.pools) {
      await pool.end();
      this.logger.log(`Pool ${slug} fechado`);
    }
    this.pools.clear();
  }
}
