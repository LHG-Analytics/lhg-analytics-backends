/**
 * Service para conversão de moeda (USD para BRL)
 * Integra com a API do Banco Central do Brasil para taxas de câmbio
 */

import { Injectable, Logger } from '@nestjs/common';
import { UnitKey } from '../database/database.interfaces';

interface ExchangeRate {
  rate: number;
  timestamp: number;
  date: string; // Formato MM-DD-YYYY
}

@Injectable()
export class CurrencyConversionService {
  private readonly logger = new Logger(CurrencyConversionService.name);
  private readonly cache = new Map<string, ExchangeRate>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora de cache
  private readonly BCB_API_URL =
    'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)';

  /**
   * Converte valor de USD para BRL se a unidade for LIV
   * @param value Valor em USD
   * @param unit Chave da unidade (ex: 'liv')
   * @param date Data para buscar a taxa (opcional, usa a data atual se não fornecida)
   * @returns Valor em BRL (ou valor original se não for LIV)
   */
  async convertUsdToBrl(
    value: number,
    unit: UnitKey,
    date?: Date,
  ): Promise<number> {
    // Só converte se for LIV
    if (unit !== 'liv') {
      return value;
    }

    // Se o valor for 0, null ou undefined, retorna como está
    if (!value || value === 0) {
      return value;
    }

    const rate = await this.getExchangeRate(date);
    return value * rate;
  }

  /**
   * Converte um array de valores de USD para BRL se a unidade for LIV
   */
  async convertArrayUsdToBrl(
    values: number[],
    unit: UnitKey,
    date?: Date,
  ): Promise<number[]> {
    if (unit !== 'liv') {
      return values;
    }

    const rate = await this.getExchangeRate(date);
    return values.map((v) => (v ? v * rate : v));
  }

  /**
   * Obtém a taxa de câmbio USD/BRL para uma data específica
   * Usa cache para evitar chamadas repetidas à API
   */
  private async getExchangeRate(date?: Date): Promise<number> {
    const targetDate = date || new Date();
    const dateKey = this.formatDateForBCB(targetDate);

    // Verifica cache
    const cached = this.cache.get(dateKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      this.logger.debug(`Usando taxa em cache para ${dateKey}: ${cached.rate}`);
      return cached.rate;
    }

    // Busca na API do BCB
    try {
      const rate = await this.fetchBCBRate(dateKey);
      this.cache.set(dateKey, {
        rate,
        timestamp: Date.now(),
        date: dateKey,
      });
      this.logger.log(`Taxa de câmbio obtida para ${dateKey}: ${rate}`);
      return rate;
    } catch (error) {
      this.logger.error(
        `Erro ao buscar taxa de câmbio para ${dateKey}: ${error.message}`,
      );

      // Tenta usar taxa em cache mesmo que expirada
      if (cached) {
        this.logger.warn(
          `Usando taxa expirada do cache para ${dateKey}: ${cached.rate}`,
        );
        return cached.rate;
      }

      // Se não tiver cache, tenta usar a taxa do dia anterior
      const previousDay = new Date(targetDate);
      previousDay.setDate(previousDay.getDate() - 1);
      const previousDayKey = this.formatDateForBCB(previousDay);

      const previousCached = this.cache.get(previousDayKey);
      if (previousCached) {
        this.logger.warn(
          `Usando taxa do dia anterior (${previousDayKey}): ${previousCached.rate}`,
        );
        return previousCached.rate;
      }

      // Taxa padrão de fallback (não ideal, mas evita erro total)
      this.logger.error('Nenhuma taxa disponível, usando taxa padrão de 5.0');
      return 5.0;
    }
  }

  /**
   * Busca a taxa na API do Banco Central do Brasil
   */
  private async fetchBCBRate(dateKey: string): Promise<number> {
    const url = `${this.BCB_API_URL}?@dataCotacao='${dateKey}'&$format=json`;

    this.logger.debug(`Fetching BCB API: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.value || data.value.length === 0) {
        throw new Error('Nenhuma cotação encontrada para esta data');
      }

      // Usa a taxa de venda (cotacaoVenda) que é mais adequada para conversão
      const rate = data.value[0].cotacaoVenda;
      return rate;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Timeout ao conectar com API do BCB');
      }
      throw error;
    }
  }

  /**
   * Formata a data para o formato esperado pela API do BCB (MM-DD-YYYY)
   */
  private formatDateForBCB(date: Date): string {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}-${day}-${year}`;
  }

  /**
   * Limpa o cache (útil para testes ou forçar atualização)
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('Cache de taxas de câmbio limpo');
  }

  /**
   * Retorna estatísticas do cache
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ date: string; rate: number; age: number }>;
  } {
    const entries = Array.from(this.cache.values()).map((entry) => ({
      date: entry.date,
      rate: entry.rate,
      age: Date.now() - entry.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}
