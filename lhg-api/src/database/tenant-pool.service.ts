/**
 * Pools de conexão PostgreSQL por unidade (multi-tenant).
 * Um Pool `pg` por tenant, criado lazy no primeiro uso, com o MESMO perfil dos
 * backends atuais (max 5, idle 30s, statement_timeout 2min — tunado para Render).
 * Padrão herdado do authentication/src/database (o mini multi-tenant do Consolidated).
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import { getTenant } from '../tenant/tenant.registry';

/**
 * O banco da unidade não aceitou a CONEXÃO (servidor fora, rede, porta
 * fechada). Diferente de erro de SQL ou de consulta lenta: os controllers que
 * o reconhecem respondem 503 UNIDADE_INDISPONIVEL, e o MCP segue com as outras
 * unidades.
 */
export class UnidadeIndisponivelError extends Error {
  constructor(
    readonly slug: string,
    readonly causa?: unknown,
  ) {
    super(`unidade ${slug} indisponível`);
    this.name = 'UnidadeIndisponivelError';
  }
}

const CODIGOS_DE_CONEXAO = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN']);

/** Falha ao CONECTAR no banco da unidade (não um erro da consulta em si). */
export function ehFalhaDeConexao(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code && CODIGOS_DE_CONEXAO.has(err.code)) return true;
  return /connection timeout|timeout exceeded when trying to connect/i.test(err.message ?? '');
}

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
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
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
      throw ehFalhaDeConexao(error) ? new UnidadeIndisponivelError(slug, error) : error;
    }
  }

  async queryWithParams<T = any>(slug: string, sql: string, params: any[]): Promise<T[]> {
    try {
      const result = await this.getPool(slug).query(sql, params);
      return result.rows as T[];
    } catch (error) {
      this.logger.error(`[${slug}] Erro na query: ${(error as Error).message}`);
      throw ehFalhaDeConexao(error) ? new UnidadeIndisponivelError(slug, error) : error;
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
