import { Injectable, BadRequestException } from '@nestjs/common';
import { Logger } from '@nestjs/common';

/**
 * Serviço utilitário para validação de entrada.
 * Centraliza validações de datas e outros inputs.
 */
@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  /**
   * Valida formato de data DD/MM/YYYY
   * @param dateStr - String de data a ser validada
   * @param fieldName - Nome do campo para mensagem de erro (opcional)
   * @returns A string de data validada
   * @throws BadRequestException se formato for inválido
   */
  validateDateFormat(dateStr: string, fieldName?: string): string {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new BadRequestException(
        `${fieldName || 'Data'} é obrigatória e deve ser uma string.`,
      );
    }

    // Remove espaços em branco
    const trimmed = dateStr.trim();

    // Valida formato DD/MM/YYYY com regex
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!regex.test(trimmed)) {
      throw new BadRequestException(
        `${fieldName || 'Data'} deve estar no formato DD/MM/YYYY. Recebido: "${trimmed}"`,
      );
    }

    const [dayStr, monthStr, yearStr] = trimmed.split('/');
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);

    // Valida ranges
    if (day < 1 || day > 31) {
      throw new BadRequestException(
        `${fieldName || 'Data'} tem dia inválido: ${day}. Dia deve estar entre 1 e 31.`,
      );
    }

    if (month < 1 || month > 12) {
      throw new BadRequestException(
        `${fieldName || 'Data'} tem mês inválido: ${month}. Mês deve estar entre 1 e 12.`,
      );
    }

    if (year < 2020 || year > 2100) {
      throw new BadRequestException(
        `${fieldName || 'Data'} tem ano inválido: ${year}. Ano deve estar entre 2020 e 2100.`,
      );
    }

    // Valida se é uma data real (ex: rejeita 31/02/2024)
    const date = new Date(year, month - 1, day);
    if (
      date.getDate() !== day ||
      date.getMonth() !== month - 1 ||
      date.getFullYear() !== year
    ) {
      throw new BadRequestException(
        `${fieldName || 'Data'} inválida: ${trimmed}. Não é uma data válida.`,
      );
    }

    this.logger.debug(`Data validada: ${trimmed}`);
    return trimmed;
  }

  /**
   * Valida que a data inicial é menor ou igual à data final
   * @param startDate - Data inicial no formato DD/MM/YYYY
   * @param endDate - Data final no formato DD/MM/YYYY
   * @throws BadRequestException se start > end
   */
  validateDateRange(startDate: string, endDate: string): void {
    const [startDay, startMonth, startYear] = startDate.split('/').map(Number);
    const [endDay, endMonth, endYear] = endDate.split('/').map(Number);

    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);

    if (start > end) {
      throw new BadRequestException(
        `Data inicial (${startDate}) deve ser menor ou igual à data final (${endDate}).`,
      );
    }

    this.logger.debug(`Intervalo de datas validado: ${startDate} a ${endDate}`);
  }

  /**
   * Valida múltiplas datas de uma vez
   * @param dates - Objeto com pares nome/valor de datas
   * @throws BadRequestException se qualquer data for inválida
   */
  validateDates(dates: Record<string, string>): Record<string, string> {
    const validated: Record<string, string> = {};

    for (const [name, value] of Object.entries(dates)) {
      validated[name] = this.validateDateFormat(value, name);
    }

    return validated;
  }

  /**
   * Valida um intervalo de datas (startDate e endDate)
   * @param startDate - Data inicial
   * @param endDate - Data final
   * @returns Objeto com as datas validadas
   * @throws BadRequestException se qualquer validação falhar
   */
  validateDateInterval(
    startDate: string,
    endDate: string,
  ): { startDate: string; endDate: string } {
    const validatedStart = this.validateDateFormat(startDate, 'startDate');
    const validatedEnd = this.validateDateFormat(endDate, 'endDate');
    this.validateDateRange(validatedStart, validatedEnd);

    return { startDate: validatedStart, endDate: validatedEnd };
  }

  /**
   * Valida que uma string não está vazia
   * @param value - Valor a ser validado
   * @param fieldName - Nome do campo para mensagem de erro
   * @throws BadRequestException se valor for vazio ou apenas espaços
   */
  validateNotEmpty(value: string, fieldName: string): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} é obrigatório.`);
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(`${fieldName} não pode estar vazio.`);
    }

    return trimmed;
  }

  /**
   * Valida que um valor está em um conjunto permitido
   * @param value - Valor a ser validado
   * @param allowedValues - Valores permitidos
   * @param fieldName - Nome do campo para mensagem de erro
   * @throws BadRequestException se valor não estiver permitido
   */
  validateAllowed<T>(
    value: T,
    allowedValues: T[],
    fieldName: string,
  ): T {
    if (!allowedValues.includes(value)) {
      throw new BadRequestException(
        `${fieldName} deve ser um dos seguintes valores: ${allowedValues.join(', ')}. Recebido: ${value}`,
      );
    }
    return value;
  }

  /**
   * Valida que um número está em um range
   * @param value - Valor a ser validado
   * @param min - Valor mínimo
   * @param max - Valor máximo
   * @param fieldName - Nome do campo para mensagem de erro
   * @throws BadRequestException se valor estiver fora do range
   */
  validateRange(
    value: number,
    min: number,
    max: number,
    fieldName: string,
  ): number {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new BadRequestException(`${fieldName} deve ser um número.`);
    }

    if (value < min || value > max) {
      throw new BadRequestException(
        `${fieldName} deve estar entre ${min} e ${max}. Recebido: ${value}`,
      );
    }

    return value;
  }

  /**
   * Valida que um período não excede um número máximo de dias
   * @param startDate - Data inicial no formato DD/MM/YYYY
   * @param endDate - Data final no formato DD/MM/YYYY
   * @param maxDays - Número máximo de dias permitido
   * @throws BadRequestException se período exceder o máximo
   */
  validateMaxPeriod(
    startDate: string,
    endDate: string,
    maxDays: number,
  ): void {
    const [startDay, startMonth, startYear] = startDate.split('/').map(Number);
    const [endDay, endMonth, endYear] = endDate.split('/').map(Number);

    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > maxDays) {
      throw new BadRequestException(
        `Período não pode exceder ${maxDays} dias. Período solicitado: ${diffDays} dias (${startDate} a ${endDate}).`,
      );
    }
  }
}
