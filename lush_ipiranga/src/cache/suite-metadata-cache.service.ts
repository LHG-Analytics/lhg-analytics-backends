/**
 * Suite Metadata Cache Service
 *
 * Cache dedicado para metadados estáticos que raramente mudam:
 * - Total de suítes
 * - Suítes por categoria
 * - Informações de apartamento/categoria
 *
 * TTL: 24 horas (dados mudam muito raramente)
 * Invalidate: Endpoint manual ou webhook quando houver mudança
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@client-local';
import { PrismaService } from '../prisma/prisma.service';

interface SuiteMetadata {
  totalSuites: number;
  suitesByCategory: Map<string, number>;
  categories: Array<{ name: string; id: number; count: number }>;
  lastUpdated: Date;
}

@Injectable()
export class SuiteMetadataCacheService {
  private readonly logger = new Logger(SuiteMetadataCacheService.name);
  private metadata: SuiteMetadata | null = null;
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 horas
  private isFetching = false;
  private pendingResolve: ((value: SuiteMetadata) => void)[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtém metadados de suítes (com cache de 24h)
   */
  async getMetadata(): Promise<SuiteMetadata> {
    // Se tem cache válido, retorna
    if (this.metadata && Date.now() - this.metadata.lastUpdated.getTime() < this.TTL) {
      return this.metadata;
    }

    // Se já está buscando, adiciona à fila de espera
    if (this.isFetching) {
      return new Promise((resolve) => {
        this.pendingResolve.push(resolve);
      });
    }

    // Busca dados
    this.isFetching = true;
    try {
      const result = await this.fetchMetadata();
      this.metadata = result;

      // Resolve todos os que estavam esperando
      this.pendingResolve.forEach((resolve) => resolve(result));
      this.pendingResolve = [];

      return result;
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Busca metadados do banco (uma única query otimizada)
   */
  private async fetchMetadata(): Promise<SuiteMetadata> {
    const startTime = Date.now();

    // ÚNICA query para buscar todos os metadados de suítes
    const result: any[] = await this.prisma.prismaLocal.$queryRaw`
      SELECT
        ca.id as category_id,
        ca.descricao as category_name,
        COUNT(DISTINCT a.id) as suite_count
      FROM categoriaapartamento ca
      INNER JOIN apartamento a ON ca.id = a.id_categoriaapartamento
      WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
        AND a.dataexclusao IS NULL
      GROUP BY ca.id, ca.descricao
      ORDER BY ca.descricao
    `;

    const suitesByCategory = new Map<string, number>();
    const categories: Array<{ name: string; id: number; count: number }> = [];
    let totalSuites = 0;

    result.forEach((row) => {
      const categoryName = row.category_name;
      const count = Number(row.suite_count);
      suitesByCategory.set(categoryName, count);
      categories.push({
        name: categoryName,
        id: Number(row.category_id),
        count,
      });
      totalSuites += count;
    });

    const elapsed = Date.now() - startTime;
    this.logger.log(
      `Metadados de suítes carregados em ${elapsed}ms: ${totalSuites} suítes em ${categories.length} categorias`,
    );

    return {
      totalSuites,
      suitesByCategory,
      categories,
      lastUpdated: new Date(),
    };
  }

  /**
   * Obtém total de suítes (helper)
   */
  async getTotalSuites(): Promise<number> {
    const metadata = await this.getMetadata();
    return metadata.totalSuites;
  }

  /**
   * Obtém suítes por categoria como array (para compatibilidade)
   */
  async getSuitesByCategory(): Promise<Array<{ suite_category: string; total_suites_in_category: number }>> {
    const metadata = await this.getMetadata();
    return metadata.categories.map((cat) => ({
      suite_category: cat.name,
      total_suites_in_category: cat.count,
    }));
  }

  /**
   * Obtém count de suítes em uma categoria específica
   */
  async getSuitesInCategory(categoryName: string): Promise<number> {
    const metadata = await this.getMetadata();
    return metadata.suitesByCategory.get(categoryName) || 1; // Retorna 1 para evitar divisão por zero
  }

  /**
   * Invalida cache manualmente (chamar quando houver mudança nas suítes)
   */
  invalidate(): void {
    this.metadata = null;
    this.logger.log('Cache de metadados de suítes invalidado');
  }

  /**
   * Retorna status do cache
   */
  getStatus(): {
    isCached: boolean;
    lastUpdated: Date | null;
    age: number | null;
    totalSuites: number | null;
  } {
    if (!this.metadata) {
      return {
        isCached: false,
        lastUpdated: null,
        age: null,
        totalSuites: null,
      };
    }

    const age = Date.now() - this.metadata.lastUpdated.getTime();
    const ageHours = age / (1000 * 60 * 60);

    return {
      isCached: true,
      lastUpdated: this.metadata.lastUpdated,
      age: Math.round(ageHours),
      totalSuites: this.metadata.totalSuites,
    };
  }
}
