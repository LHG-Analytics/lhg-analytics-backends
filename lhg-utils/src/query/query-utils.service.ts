import { Injectable } from '@nestjs/common';

/**
 * Service para utilitários de SQL e queries
 * Fornece métodos seguros para formatação e sanitização de queries
 */
@Injectable()
export class QueryUtilsService {
  /**
   * Formata um Date para timestamp Unix (segundos)
   * Uso em queries PostgreSQL/MySQL com colunas timestamp
   *
   * @param date - Data a ser formatada
   * @returns Timestamp em segundos
   * @throws Error se data for inválida
   */
  formatDateToTimestamp(date: Date): number {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error(`Data inválida para timestamp: ${date}`);
    }
    return Math.floor(date.getTime() / 1000);
  }

  /**
   * Formata um Date para ISO 8601 string (UTC)
   * Uso em queries SQL com comparação de datas
   *
   * @param date - Data a ser formatada
   * @returns String no formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
   * @throws Error se data for inválida
   */
  formatDateToISO(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error(`Data inválida para ISO: ${date}`);
    }
    return date.toISOString();
  }

  /**
   * Formata um Date para formato SQL datetime (YYYY-MM-DD HH:mm:ss)
   * Uso em queries SQL com comparação de datas
   *
   * @param date - Data a ser formatada
   * @returns String no formato SQL datetime
   * @throws Error se data for inválida
   */
  formatDateToSQL(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error(`Data inválida para SQL: ${date}`);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Formata um Date para formato SQL date (YYYY-MM-DD)
   * Uso em queries SQL com comparação de apenas data
   *
   * @param date - Data a ser formatada
   * @returns String no formato SQL date
   * @throws Error se data for inválida
   */
  formatDateToSQLDate(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error(`Data inválida para SQL date: ${date}`);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Sanitiza uma lista de IDs para uso em cláusulas SQL IN
   * Valida que todos são números inteiros positivos
   *
   * @param ids - Array de IDs (números ou strings)
   * @returns String com IDs separados por vírgula
   * @throws Error se algum ID for inválido
   *
   * @example
   * sanitizeIdList([1, 2, 3]) // returns "1, 2, 3"
   * sanitizeIdList(['1', '2', '3']) // returns "1, 2, 3"
   * sanitizeIdList([1, 'abc', 3]) // throws Error
   */
  sanitizeIdList(ids: (number | string)[]): string {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('Lista de IDs deve ser um array não vazio');
    }

    const sanitized = ids.map((id, index) => {
      let num: number;

      if (typeof id === 'string') {
        num = parseInt(id, 10);
      } else if (typeof id === 'number') {
        num = id;
      } else {
        throw new Error(`ID inválido no índice ${index}: tipo não suportado`);
      }

      if (isNaN(num) || !Number.isInteger(num) || num < 0) {
        throw new Error(`ID inválido no índice ${index}: ${id} (deve ser inteiro >= 0)`);
      }

      return num;
    });

    return sanitized.join(', ');
  }

  /**
   * Escapa uma string para uso seguro em queries SQL
   * NOTE: Prefira parameterized queries quando possível
   *
   * @param str - String a ser escapada
   * @returns String escapada
   */
  escapeString(str: string): string {
    if (typeof str !== 'string') {
      throw new Error(`Valor deve ser uma string, recebido: ${typeof str}`);
    }
    // Escapa aspas simples duplicando-as
    return str.replace(/'/g, "''");
  }

  /**
   * Cria uma cláusula BETWEEN para datas formatada para SQL
   *
   * @param startDate - Data inicial
   * @param endDate - Data final
   * @param columnName - Nome da coluna para a cláusula
   * @param useTimestamp - Se true, usa formato timestamp (default: false)
   * @returns String com cláusula BETWEEN formatada
   *
   * @example
   * createDateBetweenClause(new Date('2025-01-01'), new Date('2025-01-31'), 'r."dataatendimento"')
   * // returns: 'r."dataatendimento" BETWEEN '2025-01-01 00:00:00' AND '2025-01-31 23:59:59''
   */
  createDateBetweenClause(
    startDate: Date,
    endDate: Date,
    columnName: string,
    useTimestamp = false,
  ): string {
    const formattedStart = useTimestamp
      ? this.formatDateToTimestamp(startDate)
      : this.formatDateToSQL(startDate);

    const formattedEnd = useTimestamp
      ? this.formatDateToTimestamp(endDate)
      : this.formatDateToSQL(endDate);

    return `${columnName} BETWEEN '${formattedStart}' AND '${formattedEnd}'`;
  }
}
