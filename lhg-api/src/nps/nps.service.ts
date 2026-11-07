/**
 * Consultas do NPS na réplica do Automo (só leitura, sem dados pessoais).
 * Nenhuma query usa now()/current_timestamp: o relógio do servidor da réplica
 * está adiantado; a janela chega pronta como parâmetro (ver nps-estadia.ts).
 */
import { Injectable } from '@nestjs/common';
import { TenantPoolService } from '../database/tenant-pool.service';
import { ConsultaEstadia, deLocalAutomo } from './nps-estadia';

export type EstadoEstadia = 'ativa' | 'finalizada_recente' | 'nenhuma';

export interface RespostaEstadia {
  unidade: string;
  suite: number;
  estado: EstadoEstadia;
  /** id_apartamentostate da raiz da cadeia (sobe por id_locacaoorigem): a chave da estadia. */
  locacao_raiz_ref: string | null;
  /** id_apartamentostate da locação desta suíte. */
  locacao_ref: string | null;
  inicio: string | null;
  fim: string | null;
  tem_reserva: boolean;
}

/** Horas como texto local (sem fuso) — não depende do TZ do processo. */
const LOCAL = `'YYYY-MM-DD"T"HH24:MI:SS.MS'`;

// Suíte = apartamento ativo de uma categoria de suíte da unidade.
export const SQL_SUITE = `
  SELECT a.id FROM apartamento a
  WHERE a.numero = $1 AND a.dataexclusao IS NULL AND a.id_categoriaapartamento = ANY($2::int[])
  ORDER BY a.id LIMIT 1`;

// No máximo 1 state aberto por suíte (uq_apartamentostate); é locação se houver
// locacaoapartamento com o mesmo id ainda sem fim.
export const SQL_ATIVA = `
  SELECT la.id_apartamentostate::text AS ref,
         to_char(la.datainicialdaocupacao, ${LOCAL}) AS inicio
  FROM apartamentostate s
  JOIN locacaoapartamento la ON la.id_apartamentostate = s.id
  WHERE s.id_apartamento = $1 AND s.datafim IS NULL AND la.datafinaldaocupacao IS NULL
  LIMIT 1`;

// Última FINALIZADA da suíte (índice id_apartamento, id DESC); a janela é o $2.
export const SQL_ULTIMA_FINALIZADA = `
  SELECT la.id_apartamentostate::text AS ref,
         to_char(la.datainicialdaocupacao, ${LOCAL}) AS inicio,
         to_char(la.datafinaldaocupacao, ${LOCAL}) AS fim,
         la.datafinaldaocupacao >= $2::timestamp AS na_janela
  FROM apartamentostate s
  JOIN locacaoapartamento la ON la.id_apartamentostate = s.id
  WHERE s.id_apartamento = $1 AND la.fimocupacaotipo = 'FINALIZADA'
  ORDER BY s.id DESC LIMIT 1`;

// Sobe por id_locacaoorigem até a raiz (trava de profundidade contra ciclo).
// A reserva acompanha a locação mais nova da cadeia: procura em toda ela.
export const SQL_CADEIA = `
  WITH RECURSIVE c AS (
    SELECT id_apartamentostate, id_locacaoorigem, 0 AS n
    FROM locacaoapartamento WHERE id_apartamentostate = $1
    UNION ALL
    SELECT l.id_apartamentostate, l.id_locacaoorigem, c.n + 1
    FROM locacaoapartamento l JOIN c ON l.id_apartamentostate = c.id_locacaoorigem
    WHERE c.n < 50
  )
  SELECT (SELECT id_apartamentostate::text FROM c ORDER BY n DESC LIMIT 1) AS raiz,
         EXISTS (
           SELECT 1 FROM reserva r
           WHERE r.id_locacaoapartamento IN (SELECT id_apartamentostate FROM c) AND r.cancelada IS NULL
         ) AS tem_reserva`;

@Injectable()
export class NpsService {
  constructor(private readonly pool: TenantPoolService) {}

  /** null = a suíte não existe (ou não é suíte) nesta unidade. */
  async estadia(c: ConsultaEstadia): Promise<RespostaEstadia | null> {
    const slug = c.tenant.slug;
    const [suite] = await this.pool.queryWithParams<{ id: number }>(slug, SQL_SUITE, [
      c.suite,
      c.tenant.suiteCategoryIds,
    ]);
    if (!suite) return null;

    const base = { unidade: slug, suite: c.suite };
    const [ativa] = await this.pool.queryWithParams<{ ref: string; inicio: string }>(slug, SQL_ATIVA, [
      suite.id,
    ]);
    let estado: EstadoEstadia;
    let loc: { ref: string; inicio: string; fim: string | null };
    if (ativa) {
      estado = 'ativa';
      loc = { ...ativa, fim: null };
    } else {
      const [ultima] = await this.pool.queryWithParams<{
        ref: string;
        inicio: string;
        fim: string;
        na_janela: boolean;
      }>(slug, SQL_ULTIMA_FINALIZADA, [suite.id, c.limiteLocal]);
      if (!ultima?.na_janela) {
        return {
          ...base,
          estado: 'nenhuma',
          locacao_raiz_ref: null,
          locacao_ref: null,
          inicio: null,
          fim: null,
          tem_reserva: false,
        };
      }
      estado = 'finalizada_recente';
      loc = ultima;
    }

    const [cadeia] = await this.pool.queryWithParams<{ raiz: string | null; tem_reserva: boolean }>(
      slug,
      SQL_CADEIA,
      [loc.ref],
    );
    return {
      ...base,
      estado,
      locacao_raiz_ref: cadeia?.raiz ?? loc.ref,
      locacao_ref: loc.ref,
      inicio: deLocalAutomo(loc.inicio),
      fim: deLocalAutomo(loc.fim),
      tem_reserva: !!cadeia?.tem_reserva,
    };
  }
}
