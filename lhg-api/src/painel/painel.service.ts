import { Injectable } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { sqlFaturamentoPorCanal } from '../bookings/bookings-canais.sql';
import { sqlTotaisPorCategoria } from '../company/company-categorias.sql';
import { TenantPoolService } from '../database/tenant-pool.service';
import { TenantConfig } from '../tenant/tenant.interfaces';
import {
  LinhaCanal,
  LinhaCategoria,
  ResumoPainel,
  totaisDasCategorias,
  totaisDasReservas,
} from './painel-totais';

/**
 * Resumo ENXUTO de uma unidade num período, só com os números do Painel TV:
 * 2 consultas agregadas (em vez das dezenas da Visão Geral + Reservas, que
 * também calculam período anterior, previsão e gráficos). O SQL é o MESMO
 * dos endpoints do dashboard (módulos *.sql.ts compartilhados), então os
 * números batem com eles.
 */
@Injectable()
export class PainelService {
  constructor(private readonly pools: TenantPoolService) {}

  /**
   * @param inicioVisao/fimVisao — datas como o CompanyController monta (dia
   *   comercial 06:00 → 05:59 de D+1).
   * @param inicioReservas/fimReservas — datas como o BookingsController monta
   *   (o bookings.service usa o DIA delas: 00:00:00 → 23:59:59).
   */
  async resumo(
    tenant: TenantConfig,
    inicioVisao: Date,
    fimVisao: Date,
    inicioReservas: Date,
    fimReservas: Date
  ): Promise<ResumoPainel> {
    // Visão Geral: mesma formatação do company.service.
    const vIni = moment.utc(inicioVisao).format('YYYY-MM-DD HH:mm:ss');
    const vFim = moment.utc(fimVisao).format('YYYY-MM-DD HH:mm:ss');
    // Reservas: mesma formatação do bookings.service.
    const rIni = moment
      .utc(inicioReservas)
      .set({ hour: 0, minute: 0, second: 0 })
      .format('YYYY-MM-DD HH:mm:ss');
    const rFim = moment
      .utc(fimReservas)
      .set({ hour: 23, minute: 59, second: 59 })
      .format('YYYY-MM-DD HH:mm:ss');

    const [categorias, canais] = await Promise.all([
      this.pools.query<LinhaCategoria>(
        tenant.slug,
        sqlTotaisPorCategoria(tenant.suiteCategoryIds.join(','), vIni, vFim)
      ),
      this.pools.query<LinhaCanal>(
        tenant.slug,
        sqlFaturamentoPorCanal(rIni, rFim)
      ),
    ]);
    return {
      ...totaisDasCategorias(categorias),
      ...totaisDasReservas(canais, tenant.bookingChannels),
    };
  }
}
