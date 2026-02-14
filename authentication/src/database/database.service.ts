/**
 * Serviço de conexão multi-tenant para bancos de dados das unidades
 * Usa node-postgres (pg) para conexões diretas sem Prisma
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import {
  UnitKey,
  UNIT_CONFIGS,
  QueryResult,
  UnitQueryResult,
} from './database.interfaces';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pools: Map<UnitKey, Pool> = new Map();

  async onModuleInit() {
    await this.initializePools();
  }

  async onModuleDestroy() {
    await this.closePools();
  }

  /**
   * Inicializa pools de conexão para todas as unidades configuradas
   */
  private async initializePools(): Promise<void> {
    const units = Object.entries(UNIT_CONFIGS) as [
      UnitKey,
      (typeof UNIT_CONFIGS)[UnitKey],
    ][];

    for (const [key, config] of units) {
      const connectionString = process.env[config.envVar];

      if (!connectionString) {
        this.logger.warn(
          `Variável de ambiente ${config.envVar} não configurada para ${config.name}`,
        );
        continue;
      }

      try {
        const pool = new Pool({
          connectionString,
          max: 20, // Máximo de conexões no pool (aumentado para warmup)
          idleTimeoutMillis: 60000, // Timeout de conexões ociosas (aumentado para 60s)
          connectionTimeoutMillis: 10000, // Timeout para estabelecer conexão
          statement_timeout: 120000, // Timeout de queries (2 minutos)
        });

        // Testa a conexão
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();

        this.pools.set(key, pool);
        this.logger.log(`Pool de conexão inicializado para ${config.name}`);
      } catch (error) {
        this.logger.error(
          `Erro ao conectar em ${config.name}: ${error.message}`,
        );
      }
    }

    this.logger.log(`${this.pools.size} pools de conexão inicializados`);
  }

  /**
   * Fecha todos os pools de conexão
   */
  private async closePools(): Promise<void> {
    for (const [key, pool] of this.pools) {
      try {
        await pool.end();
        this.logger.log(
          `Pool de conexão fechado para ${UNIT_CONFIGS[key].name}`,
        );
      } catch (error) {
        this.logger.error(
          `Erro ao fechar pool de ${UNIT_CONFIGS[key].name}: ${error.message}`,
        );
      }
    }
    this.pools.clear();
  }

  /**
   * Executa uma query em uma unidade específica
   */
  async query<T = any>(
    unit: UnitKey,
    sql: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    const pool = this.pools.get(unit);

    if (!pool) {
      throw new Error(
        `Pool de conexão não disponível para ${UNIT_CONFIGS[unit]?.name || unit}`,
      );
    }

    try {
      const result = await pool.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
      };
    } catch (error) {
      this.logger.error(
        `Erro na query para ${UNIT_CONFIGS[unit].name}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Executa uma query em todas as unidades em paralelo
   */
  async queryAll<T = any>(
    sql: string | ((unit: UnitKey) => string),
    params?: any[],
  ): Promise<UnitQueryResult<T>[]> {
    const units = Array.from(this.pools.keys());

    const promises = units.map(async (unit): Promise<UnitQueryResult<T>> => {
      try {
        const sqlToExecute = typeof sql === 'function' ? sql(unit) : sql;
        const result = await this.query<T>(unit, sqlToExecute, params);
        return {
          unit,
          unitName: UNIT_CONFIGS[unit].name,
          success: true,
          data: result.rows as T,
        };
      } catch (error) {
        return {
          unit,
          unitName: UNIT_CONFIGS[unit].name,
          success: false,
          error: error.message,
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Verifica quais unidades estão conectadas
   */
  getConnectedUnits(): UnitKey[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Verifica se uma unidade está conectada
   */
  isConnected(unit: UnitKey): boolean {
    return this.pools.has(unit);
  }

  /**
   * Obtém a configuração de uma unidade
   */
  getUnitConfig(unit: UnitKey) {
    return UNIT_CONFIGS[unit];
  }

  /**
   * Obtém todas as configurações de unidades
   */
  getAllUnitConfigs() {
    return UNIT_CONFIGS;
  }
}
