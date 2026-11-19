import { DateUtilsService } from '@lhg/utils';
import { ServiceType } from '../cache/cache.interfaces';

/** Opções do DateUtilsService.convertToDate. */
type OpcoesData = NonNullable<Parameters<DateUtilsService['convertToDate']>[1]>;

/** Início do dia comercial: 06:00 (UTC, como os controllers do dashboard). */
export const INICIO_DIA_COMERCIAL: OpcoesData = {
  useUTC: true,
  startHour: 6,
  startMinute: 0,
  startSecond: 0,
};

/** Fim do dia comercial no próprio dia (05:59:59) — o service aplica o D+1 se precisar. */
export const FIM_DIA_COMERCIAL: OpcoesData = {
  isEndDate: true,
  useUTC: true,
  endHour: 5,
  endMinute: 59,
  endSecond: 59,
};

/** Fim do dia comercial já em D+1 (05:59:59 do dia seguinte) — Visão Geral. */
export const FIM_DIA_COMERCIAL_D1: OpcoesData = {
  ...FIM_DIA_COMERCIAL,
  addDayForEndDate: true,
};

/**
 * Como cada serviço converte as datas DD/MM/YYYY da requisição em instantes.
 * Fonte ÚNICA para os controllers e para o warmup do cache: o warmup PRECISA
 * calcular exatamente os mesmos instantes que o controller, porque a chave do
 * cache (CUSTOM) usa o instante exato.
 */
export const OPCOES_DATAS: Record<
  ServiceType,
  { inicio: OpcoesData; fim: OpcoesData }
> = {
  company: { inicio: INICIO_DIA_COMERCIAL, fim: FIM_DIA_COMERCIAL_D1 },
  bookings: { inicio: INICIO_DIA_COMERCIAL, fim: FIM_DIA_COMERCIAL },
  governance: { inicio: INICIO_DIA_COMERCIAL, fim: FIM_DIA_COMERCIAL },
  restaurant: {
    inicio: { useUTC: true },
    fim: { isEndDate: true, useUTC: true },
  },
};

/** Os instantes de início e fim de um serviço para datas DD/MM/YYYY (igual ao controller). */
export function datasDoServico(
  dateUtils: DateUtilsService,
  servico: ServiceType,
  inicio: string,
  fim: string
): { start: Date | undefined; end: Date | undefined } {
  return {
    start: dateUtils.convertToDate(inicio, OPCOES_DATAS[servico].inicio),
    end: dateUtils.convertToDate(fim, OPCOES_DATAS[servico].fim),
  };
}
