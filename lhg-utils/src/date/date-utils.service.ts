import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';

/**
 * Serviço utilitário para manipulação de datas.
 * Centraliza funções de formatação e cálculo de períodos
 * que estão duplicadas em vários backends.
 */
@Injectable()
export class DateUtilsService {
  private readonly logger = new Logger(DateUtilsService.name);

  /**
   * Converte string de data DD/MM/YYYY para Date
   * Ajusta timezone e horas conforme necessário
   * @param dateStr - Data no formato DD/MM/YYYY
   * @param options - Opções de conversão
   * @returns Objeto Date ou undefined
   */
  convertToDate(
    dateStr: string | undefined,
    options?: {
      isEndDate?: boolean;
      timezoneOffset?: number;
      startHour?: number;
      startMinute?: number;
      startSecond?: number;
      endHour?: number;
      endMinute?: number;
      endSecond?: number;
      useUTC?: boolean;
      addDayForEndDate?: boolean;
    },
  ): Date | undefined {
    if (!dateStr) return undefined;

    const {
      isEndDate = false,
      timezoneOffset = 0,
      startHour = 0,
      startMinute = 0,
      startSecond = 0,
      endHour = 23,
      endMinute = 59,
      endSecond = 59,
      useUTC = false,
      addDayForEndDate = false,
    } = options || {};

    const [day, month, year] = dateStr.split('/').map(Number);

    // Validação básica
    if (isNaN(day) || isNaN(month) || isNaN(year)) {
      throw new Error('Invalid date format. Please use DD/MM/YYYY.');
    }

    const date = new Date(year, month - 1, day);

    // Valida se a data é válida
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
      throw new Error('Invalid date. Please ensure it is a valid date in the format DD/MM/YYYY.');
    }

    // Adiciona um dia para endDate se solicitado (usado em Company com D+1)
    if (isEndDate && addDayForEndDate) {
      date.setDate(date.getDate() + 1);
    }

    if (isEndDate) {
      if (useUTC) {
        date.setUTCHours(endHour, endMinute, endSecond, 999);
      } else {
        date.setHours(endHour, endMinute, endSecond, 999);
      }
    } else {
      if (useUTC) {
        date.setUTCHours(startHour, startMinute, startSecond, 0);
      } else {
        date.setHours(startHour, startMinute, startSecond, 0);
      }
    }

    // Ajuste de timezone se necessário
    if (timezoneOffset !== 0) {
      const currentHours = useUTC ? date.getUTCHours() : date.getHours();
      if (useUTC) {
        date.setUTCHours(currentHours + timezoneOffset);
      } else {
        date.setHours(currentHours + timezoneOffset);
      }
    }

    return date;
  }

  /**
   * Formata Date para string DD/MM/YYYY
   * @param date - Objeto Date
   * @returns Data no formato DD/MM/YYYY
   */
  formatDateBR(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Formata data para chave de mapa (YYYY-MM-DD)
   * @param date - Date ou string em formato DD/MM/YYYY ou YYYY-MM-DD
   * @returns Data no formato YYYY-MM-DD
   */
  formatDateKey(date: Date | string): string {
    if (typeof date === 'string') {
      // Se já for string no formato correto
      if (date.includes('-')) {
        return date.split('T')[0];
      }
      // Se for DD/MM/YYYY
      const [day, month, year] = date.split('/');
      return `${year}-${month}-${day}`;
    }
    return date.toISOString().split('T')[0];
  }

  /**
   * Formata data para exibição (DD/MM/YYYY)
   * @param dateKey - Data no formato YYYY-MM-DD
   * @returns Data no formato DD/MM/YYYY
   */
  formatDateDisplay(dateKey: string): string {
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}/${year}`;
  }

  /**
   * Formata data YYYY-MM-DD para MM/YYYY
   * @param dateKey - Data no formato YYYY-MM-DD
   * @returns Data no formato MM/YYYY
   */
  formatDateToMonth(dateKey: string): string {
    const [year, month] = dateKey.split('-');
    return `${month}/${year}`;
  }

  /**
   * Calcula total de dias do período (inclusive)
   * @param startDate - Data inicial no formato DD/MM/YYYY
   * @param endDate - Data final no formato DD/MM/YYYY
   * @returns Número de dias do período
   */
  calculateTotalDays(startDate: string, endDate: string): number {
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  /**
   * Calcula o período do mês atual para forecast
   * Retorna: dia 1 às 06:00:00 até ontem às 05:59:59 (D+1)
   * @returns Objeto com dados do mês atual
   */
  calculateCurrentMonthPeriod(): {
    monthStart: string;
    monthEnd: string;
    daysElapsed: number;
    remainingDays: number;
    totalDaysInMonth: number;
  } {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const totalDaysInMonth = currentMonthEnd.getDate();

    // Ontem (para calcular dias decorridos)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const daysElapsed = yesterday.getDate();
    const remainingDays = totalDaysInMonth - daysElapsed;

    // Formata para DD/MM/YYYY
    const monthStart = this.formatDateBR(currentMonthStart);
    const monthEnd = this.formatDateBR(yesterday);

    return {
      monthStart,
      monthEnd,
      daysElapsed,
      remainingDays,
      totalDaysInMonth,
    };
  }

  /**
   * Calcula o período anterior (mesma duração, imediatamente antes)
   * @param startDate - Data inicial do período atual
   * @param endDate - Data final do período atual
   * @returns Objeto com datas do período anterior formatadas
   */
  calculatePreviousPeriod(
    startDate: string,
    endDate: string,
  ): { previousStart: string; previousEnd: string } {
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);

    // Duração em dias
    const durationMs = end.getTime() - start.getTime();
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

    // Calcula período anterior (subtrai duração + 1 dia para não sobrepor)
    const previousEnd = new Date(start);
    previousEnd.setDate(previousEnd.getDate() - 1);

    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - durationDays);

    return {
      previousStart: this.formatDateBR(previousStart),
      previousEnd: this.formatDateBR(previousEnd),
    };
  }

  /**
   * Gera array de períodos entre startDate e endDate
   * @param startDate - Data inicial no formato DD/MM/YYYY
   * @param endDate - Data final no formato DD/MM/YYYY
   * @param groupByMonth - Se true, retorna MM/YYYY; senão, DD/MM/YYYY
   * @returns Array de strings com os períodos
   */
  generatePeriodRange(
    startDate: string,
    endDate: string,
    groupByMonth: boolean,
  ): string[] {
    const periods: string[] = [];
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);

    if (groupByMonth) {
      // Agrupa por mês - gera MM/YYYY
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const month = (current.getMonth() + 1).toString().padStart(2, '0');
        const year = current.getFullYear();
        periods.push(`${month}/${year}`);
        current.setMonth(current.getMonth() + 1);
      }
    } else {
      // Gera DD/MM/YYYY para cada dia
      const current = new Date(start);
      while (current <= end) {
        periods.push(this.formatDateBR(current));
        current.setDate(current.getDate() + 1);
      }
    }

    return periods;
  }

  /**
   * Converte string de data DD/MM/YYYY para Date (uso interno)
   * @param dateStr - Data no formato DD/MM/YYYY
   * @returns Objeto Date
   * @private
   */
  private parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
}
