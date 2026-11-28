/**
 * Job do CRM: lê as réplicas do Automo pelos pools do lhg-api e grava no
 * schema `raw` do Supabase do CRM. NÃO abre conexão nova com o Automo e não
 * expõe rota HTTP.
 *
 * Roda DENTRO da janela da madrugada (CRM_ETL_JANELA, hora de São Paulo),
 * conferindo a cada 10 min:
 *  - histórico (backfill): enquanto a marca d'água da unidade estiver atrasada
 *    mais de 2 dias, grava blocos de 1 mês de check-outs, sem sobreposição; o
 *    que não couber numa noite continua na seguinte;
 *  - incremental: uma vez por noite, relê de (marca d'água − N dias) até agora,
 *    para pegar estornos, itens cancelados e ajustes tardios.
 * Desligado sem CRM_ETL_DATABASE_URL e sem CRM_DOC_HMAC_KEYS (o lhg-api sobe
 * igual). Log só com unidade, janela, contagens e tempo — nenhum dado pessoal.
 */
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import * as moment from 'moment-timezone';
import { TenantPoolService } from '../database/tenant-pool.service';
import { getTenant } from '../tenant/tenant.registry';
import { CrmEtlConfig, dentroDaJanela, lerConfigCrmEtl } from './crm-etl.config';
import { Contagens, DestinoCrm, DestinoPg, ExecucaoEtl } from './crm-etl.destino';
import {
  SQL_CAPACIDADES,
  SQL_ITENS,
  SQL_RESERVAS,
  SQL_TABELA_PRECO,
  sqlEstadias,
  sqlPessoas,
} from './crm-etl.sql';
import {
  LinhaEstadia,
  LinhaItem,
  LinhaPessoa,
  LinhaReserva,
  transformar,
  unidadeCrm,
} from './crm-etl.transformar';
import { Genero, SQL_DICIONARIO_NOMES, montarDicionario } from './crm-etl.genero';

const FMT = 'YYYY-MM-DDTHH:mm:ss.SSS';
/** Tokens opcionais (testes): destino falso e configuração explícita. */
export const CRM_ETL_DESTINO = 'CRM_ETL_DESTINO';
export const CRM_ETL_CONFIG = 'CRM_ETL_CONFIG';
export const CRM_ETL_INTERVALO_MS = 10 * 60_000;
/** Marca d'água mais atrasada que isto → histórico (blocos de 1 mês). */
export const CRM_ETL_ATRASO_BACKFILL_DIAS = 2;
/** Dicionário de nomes (A1): relido uma vez por dia por unidade. */
export const CRM_ETL_DICIONARIO_TTL_MS = 24 * 3600_000;

/** Soma/subtrai em texto local (sem fuso), sem passar por horário de verão. */
const somar = (local: string, n: number, un: 'days' | 'months') => moment.utc(local, FMT).add(n, un).format(FMT);

@Injectable()
export class CrmEtlService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CrmEtlService.name);
  readonly config: CrmEtlConfig;
  private destino: DestinoCrm | null = null;
  private timer: NodeJS.Timeout | null = null;
  private rodando = false;
  /** Unidade → dia (São Paulo) do último incremental ok. */
  private incrementalFeito = new Map<string, string>();
  private capacidades = new Map<string, { tem_ordem: boolean; pode_tabela: boolean }>();
  private dicionarios = new Map<string, { em: number; dic: ReadonlyMap<string, Genero> }>();

  /** Relógio (ms); trocado nos testes. */
  relogio: () => number = Date.now;

  constructor(
    private readonly pools: TenantPoolService,
    @Optional() @Inject(CRM_ETL_DESTINO) destino?: DestinoCrm,
    @Optional() @Inject(CRM_ETL_CONFIG) config?: CrmEtlConfig,
  ) {
    this.config = config ?? lerConfigCrmEtl();
    if (destino) this.destino = destino;
  }

  onApplicationBootstrap() {
    if (!this.config.ativo) {
      this.logger.log(`crm_etl: desligado (${this.config.motivo})`);
      return;
    }
    this.destino ??= new DestinoPg(this.config.urlDestino, this.config.schema, this.config.ca);
    this.logger.log(
      `crm_etl: ATIVO unidades=${this.config.unidades.length} schema=${this.config.schema} ` +
        `janela=${this.config.janela.join('-')}h chave=${this.config.chave!.id} ` +
        `tls=${this.config.ca ? 'certificado verificado' : 'só criptografia (sem CRM_ETL_DB_CA)'}`,
    );
    this.timer = setInterval(() => void this.ciclo(), CRM_ETL_INTERVALO_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.destino?.fechar().catch(() => undefined);
  }

  /** Um ciclo do agendador. */
  async ciclo(agoraMs = this.relogio()): Promise<void> {
    if (this.rodando || !this.destino || !this.config.ativo) return;
    const horaSp = moment.tz(agoraMs, 'America/Sao_Paulo').hours();
    if (!dentroDaJanela(horaSp, this.config.janela)) return;
    this.rodando = true;
    try {
      for (const slug of this.config.unidades) {
        try {
          await this.processarUnidade(slug, agoraMs);
        } catch {
          // já registrado em executar(); segue para a próxima unidade
        }
      }
    } finally {
      this.rodando = false;
    }
  }

  /** Histórico em blocos e, em dia, o incremental da noite. */
  async processarUnidade(slug: string, agoraMs: number): Promise<void> {
    const un = unidadeCrm(slug);
    const diaSp = moment.tz(agoraMs, 'America/Sao_Paulo').format('YYYY-MM-DD');
    const agoraLocal = moment.tz(agoraMs, un.fuso).format(FMT);
    const limiteAtraso = somar(agoraLocal, -CRM_ETL_ATRASO_BACKFILL_DIAS, 'days');

    let marca = await this.destino!.marcaDagua(slug);
    while (marca === null || marca < limiteAtraso) {
      // O histórico para quando a janela da madrugada acaba; continua na próxima noite.
      if (!dentroDaJanela(moment.tz(this.relogio(), 'America/Sao_Paulo').hours(), this.config.janela)) return;
      const desde = marca ?? `${this.config.backfillDesde}T00:00:00.000`;
      const fimBloco = somar(desde, 1, 'months');
      const ate = fimBloco < agoraLocal ? fimBloco : agoraLocal;
      await this.executar(slug, 'backfill', desde, ate);
      marca = ate;
    }
    if (this.incrementalFeito.get(slug) === diaSp) return;
    await this.executar(slug, 'incremental', somar(marca, -this.config.reprocessarDias, 'days'), agoraLocal);
    this.incrementalFeito.set(slug, diaSp);
  }

  /** Lê a janela de check-out [desde, ate) da unidade e grava no destino. */
  async executar(
    slug: string,
    modo: ExecucaoEtl['modo'],
    desde: string,
    ate: string,
  ): Promise<Contagens> {
    const tenant = getTenant(slug);
    if (!tenant) throw new Error(`crm_etl: unidade desconhecida ${slug}`);
    const exec: ExecucaoEtl = { id: crypto.randomUUID(), unidade: slug, modo, desde, ate, iniciadoEm: new Date() };
    const t0 = Date.now();
    try {
      const cap = await this.capacidadesDe(slug);
      const estadias = await this.pools.queryWithParams<LinhaEstadia>(slug, sqlEstadias(tenant.suiteCategoryIds), [
        desde,
        ate,
      ]);
      const ids = [...new Set(estadias.flatMap((e) => e.cadeia))].map(Number);
      const [pessoas, itens, tabelas] = ids.length
        ? await Promise.all([
            this.pools.queryWithParams<LinhaPessoa>(slug, sqlPessoas(cap.tem_ordem), [ids]),
            this.pools.queryWithParams<LinhaItem>(slug, SQL_ITENS, [ids]),
            cap.pode_tabela
              ? this.pools.queryWithParams<{ loc: string; tabela: string | null }>(slug, SQL_TABELA_PRECO, [ids])
              : Promise.resolve([]),
          ])
        : [[], [], []];
      const reservas = await this.pools.queryWithParams<LinhaReserva>(slug, SQL_RESERVAS, [ids, desde, ate]);
      const lote = transformar({
        tenant,
        chave: this.config.chave!,
        estadias,
        pessoas,
        itens,
        reservas,
        tabelas: new Map(tabelas.filter((x) => x.tabela).map((x) => [x.loc, x.tabela!])),
        generos: pessoas.length ? await this.dicionarioDe(slug) : undefined,
      });
      const contagens = await this.destino!.gravar(exec, lote);
      this.logger.log(
        `crm_etl.ok unidade=${slug} modo=${modo} desde=${desde} ate=${ate} ` +
          Object.entries(contagens)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ') +
          ` ms=${Date.now() - t0}`,
      );
      return contagens;
    } catch (e) {
      // Só a classe/código do erro: a mensagem do driver pode citar valores.
      const err = e as { code?: string; name?: string };
      const codigo = `${err.name ?? 'Error'}${err.code ? `:${err.code}` : ''}`;
      this.logger.error(`crm_etl.erro unidade=${slug} modo=${modo} desde=${desde} ate=${ate} erro=${codigo}`);
      await this.destino!.registrarErro(exec, codigo).catch(() => undefined);
      throw e;
    }
  }

  /**
   * Dicionário 1º nome → gênero da unidade (A1), lido uma vez por dia: no
   * histórico em blocos, a mesma consulta agregada serve para todos os meses.
   * Só agregados por nome; fica só em memória.
   */
  private async dicionarioDe(slug: string): Promise<ReadonlyMap<string, Genero>> {
    const d = this.dicionarios.get(slug);
    if (d && Date.now() - d.em < CRM_ETL_DICIONARIO_TTL_MS) return d.dic;
    const linhas = await this.pools.query<{ nome: string; f: number; m: number }>(slug, SQL_DICIONARIO_NOMES);
    const dic = montarDicionario(linhas);
    this.dicionarios.set(slug, { em: Date.now(), dic });
    return dic;
  }

  private async capacidadesDe(slug: string) {
    let c = this.capacidades.get(slug);
    if (!c) {
      const [r] = await this.pools.query<{ tem_ordem: boolean; pode_tabela: boolean }>(slug, SQL_CAPACIDADES);
      c = { tem_ordem: !!r?.tem_ordem, pode_tabela: !!r?.pode_tabela };
      this.capacidades.set(slug, c);
    }
    return c;
  }
}
