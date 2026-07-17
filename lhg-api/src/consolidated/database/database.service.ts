/**
 * ADAPTER: mesma API do DatabaseService do authentication (de onde o módulo
 * Consolidated foi migrado), mas delegando aos pools do lhg-api
 * (TenantPoolService — max 5 conexões/unidade, em vez dos 20 do original).
 * Mantém a superfície idêntica para os *-multitenant.service.ts portados
 * não mudarem uma linha.
 */
import { Injectable, Logger } from '@nestjs/common';
import { TenantPoolService } from '../../database/tenant-pool.service';
import { allTenants } from '../../tenant/tenant.registry';
import { QueryResult, UNIT_CONFIGS, UnitKey, UnitQueryResult } from './database.interfaces';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger('ConsolidatedDatabaseService');

  constructor(private readonly pools: TenantPoolService) {}

  async query<T = any>(unit: UnitKey, sql: string, params?: any[]): Promise<QueryResult<T>> {
    try {
      const rows = params?.length
        ? await this.pools.queryWithParams<T>(unit, sql, params)
        : await this.pools.query<T>(unit, sql);
      return { rows, rowCount: rows.length };
    } catch (error) {
      this.logger.error(
        `Erro na query para ${UNIT_CONFIGS[unit]?.name || unit}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async queryAll<T = any>(
    sql: string | ((unit: UnitKey) => string),
    params?: any[],
  ): Promise<UnitQueryResult<T>[]> {
    const units = this.getConnectedUnits();
    const promises = units.map(async (unit): Promise<UnitQueryResult<T>> => {
      try {
        const sqlToExecute = typeof sql === 'function' ? sql(unit) : sql;
        const result = await this.query<T>(unit, sqlToExecute, params);
        return { unit, unitName: UNIT_CONFIGS[unit].name, success: true, data: result.rows as T };
      } catch (error) {
        return {
          unit,
          unitName: UNIT_CONFIGS[unit].name,
          success: false,
          error: (error as Error).message,
        };
      }
    });
    return Promise.all(promises);
  }

  getConnectedUnits(): UnitKey[] {
    // Pools do lhg-api são lazy — considera todas as unidades do registry
    return allTenants().map((t) => t.slug as UnitKey);
  }

  isConnected(unit: UnitKey): boolean {
    return this.getConnectedUnits().includes(unit);
  }

  getUnitConfig(unit: UnitKey) {
    return UNIT_CONFIGS[unit];
  }

  getAllUnitConfigs() {
    return UNIT_CONFIGS;
  }
}
