import { Injectable } from '@nestjs/common';
import pLimit, { LimitFunction } from 'p-limit';

/**
 * Service para controle de concorrência em operações assíncronas.
 *
 * Útil para limitar o número de operações simultâneas (ex: queries de banco)
 * para evitar sobrecarga de recursos.
 *
 * @example
 * const queries = [
 *   () => database.query(unit1, sql1),
 *   () => database.query(unit2, sql2),
 *   // ... mais queries
 * ];
 * const results = await concurrencyUtils.executeWithLimit(queries, 5);
 */
@Injectable()
export class ConcurrencyUtilsService {
  private limiters = new Map<string, LimitFunction>();

  /**
   * Executa um array de funções assíncronas com limite de concorrência.
   *
   * @param tasks - Array de funções que retornam Promise
   * @param concurrency - Número máximo de tarefas simultâneas (padrão: 5)
   * @returns Promise<T[]> - Array com os resultados na mesma ordem das tarefas
   *
   * @example
   * const tasks = [
   *   () => this.database.query('unit1', sql),
   *   () => this.database.query('unit2', sql),
   * ];
   * const results = await this.concurrencyUtils.executeWithLimit(tasks, 3);
   */
  async executeWithLimit<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number = 5,
  ): Promise<T[]> {
    const limit = pLimit(concurrency);

    const limitedTasks = tasks.map((task) =>
      limit(() => task()),
    );

    return Promise.all(limitedTasks);
  }

  /**
   * Executa tarefas com limite de concorrência usando um pool nomeado reutilizável.
   *
   * Útil quando você quer compartilhar o mesmo limite entre múltiplas chamadas.
   * O pool é criado na primeira chamada e reutilizado nas subsequentes.
   *
   * @param poolName - Nome do pool para reutilizar o limite
   * @param tasks - Array de funções que retornam Promise
   * @param concurrency - Número máximo de tarefas simultâneas
   * @returns Promise<T[]>
   *
   * @example
   * // Primeira chamada - cria o pool
   * await this.concurrencyUtils.executeWithPool('database', tasks1, 5);
   * // Chamadas subsequentes - reutiliza o mesmo pool
   * await this.concurrencyUtils.executeWithPool('database', tasks2, 5);
   */
  async executeWithPool<T>(
    poolName: string,
    tasks: (() => Promise<T>)[],
    concurrency: number = 5,
  ): Promise<T[]> {
    let limit = this.limiters.get(poolName);

    if (!limit) {
      limit = pLimit(concurrency);
      this.limiters.set(poolName, limit);
    }

    const limitedTasks = tasks.map((task) => limit(() => task()));

    return Promise.all(limitedTasks);
  }

  /**
   * Limpa um pool nomeado (útil para testes ou quando o limite precisa ser redefinido).
   *
   * @param poolName - Nome do pool a ser removido
   */
  clearPool(poolName: string): void {
    this.limiters.delete(poolName);
  }

  /**
   * Limpa todos os pools (útil para testes).
   */
  clearAllPools(): void {
    this.limiters.clear();
  }

  /**
   * Retorna uma função que executa tarefas com limite de concorrência.
   * Útil para composição de funções.
   *
   * @param concurrency - Número máximo de tarefas simultâneas
   * @returns Função que recebe um array de tarefas e retorna Promise com resultados
   *
   * @example
   * const limitQueries = this.concurrencyUtils.createLimiter(3);
   * const results = await limitQueries([
   *   () => this.database.query('unit1', sql),
   *   () => this.database.query('unit2', sql),
   * ]);
   */
  createLimiter<T>(concurrency: number = 5): (tasks: (() => Promise<T>)[]) => Promise<T[]> {
    return (tasks: (() => Promise<T>)[]) => this.executeWithLimit(tasks, concurrency);
  }

  /**
   * Executa tarefas em lotes (batch) com limite de concorrência.
   *
   * @param items - Array de itens a serem processados
   * @param processor - Função que processa cada item
   * @param concurrency - Número máximo de tarefas simultâneas
   * @returns Promise<R[]> - Array com os resultados processados
   *
   * @example
   * const units = ['unit1', 'unit2', 'unit3', 'unit4'];
   * const results = await this.concurrencyUtils.executeBatch(
   *   units,
   *   (unit) => this.fetchUnitData(unit),
   *   2, // Processa 2 unidades por vez
   * );
   */
  async executeBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 5,
  ): Promise<R[]> {
    const limit = pLimit(concurrency);

    const tasks = items.map((item) =>
      limit(() => processor(item)),
    );

    return Promise.all(tasks);
  }

  /**
   * Wrapper para Promise.all com limite de concorrência.
   * Mantém a mesma assinatura do Promise.all original.
   *
   * @param tasks - Array de Promises
   * @param concurrency - Número máximo de tarefas simultâneas
   * @returns Promise<T[]>
   *
   * @example
   * // Em vez de:
   * // await Promise.all([task1, task2, task3, ...])
   * // Use:
   * await this.concurrencyUtils.all([task1, task2, task3, ...], 3);
   */
  async all<T>(
    tasks: Promise<T>[],
    concurrency: number = 5,
  ): Promise<T[]> {
    const limit = pLimit(concurrency);

    const limitedTasks = tasks.map((task) =>
      limit(() => task),
    );

    return Promise.all(limitedTasks);
  }

  /**
   * Retorna o número de tarefas em execução no momento para um pool específico.
   *
   * @param poolName - Nome do pool
   * @returns Número de tarefas ativas ou undefined se o pool não existir
   */
  getActiveCount(poolName: string): number | undefined {
    const limit = this.limiters.get(poolName);
    return limit?.activeCount;
  }

  /**
   * Retorna o número de tarefas pendentes no pool.
   *
   * @param poolName - Nome do pool
   * @returns Número de tarefas pendentes ou undefined se o pool não existir
   */
  getPendingCount(poolName: string): number | undefined {
    const limit = this.limiters.get(poolName);
    return limit?.pendingCount;
  }
}
