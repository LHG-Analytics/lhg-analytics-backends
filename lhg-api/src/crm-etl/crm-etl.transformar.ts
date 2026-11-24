/**
 * Linhas do Automo → linhas do schema `raw` do CRM (função PURA, testável sem
 * banco). Aqui o documento vira doc_hash e os contatos viram booleanos: o que
 * sai desta função é tudo o que o CRM recebe — sem nome, sem CPF/cédula, sem
 * telefone, sem e-mail.
 */
import * as moment from 'moment-timezone';
import { TenantConfig } from '../tenant/tenant.interfaces';
import { docHash, normalizarDocumento, TipoDocumento } from './crm-etl.doc';
import { ehPacote, grupoDoItem } from './crm-etl.grupos';

export interface UnidadeCrm {
  slug: string;
  moeda: 'BRL' | 'USD';
  fuso: string;
  pais: 'BR' | 'EC';
}

export function unidadeCrm(slug: string): UnidadeCrm {
  return slug === 'liv'
    ? { slug, moeda: 'USD', fuso: 'America/Guayaquil', pais: 'EC' }
    : { slug, moeda: 'BRL', fuso: 'America/Sao_Paulo', pais: 'BR' };
}

/** Início do dia comercial (06:00–05:59), o mesmo dos KPIs do Analytics. */
export const HORA_DIA_COMERCIAL = 6;

// ── Linhas do Automo (o que as consultas de crm-etl.sql.ts devolvem) ───────
export interface LinhaEstadia {
  id_locacao: string;
  raiz: string;
  cadeia: string[];
  chegada: string;
  ini: string;
  fim: string;
  perm: string;
  ocup: string;
  descv: string;
  gorjeta: string;
  tipo_desc: string | null;
  ocupantes: number | null;
  categoria_id: number;
  categoria: string;
  suite: string;
  funcionario: number | null;
  meios: string[] | null;
  meios_dep: string[] | null;
}
export interface LinhaPessoa {
  loc: string;
  id_cliente: string;
  ordem: number | string | null;
  id_pessoa: string | null;
  doc: string | null;
  celular: string | null;
  telefone1: string | null;
  telefone2: string | null;
  email: string | null;
  sexo: string | null;
  ano_nascimento: number | null;
  cadastro_em: string | null;
}
export interface LinhaItem {
  loc: string;
  id_item: string;
  id_item_pai: string | null;
  id_pacote: string | null;
  produto_id: string;
  produto: string | null;
  tipo: string | null;
  quantidade: string;
  preco: string;
  lancado: string | null;
}
export interface LinhaReserva {
  id_reserva: string;
  loc: string | null;
  id_cliente: string | null;
  canal: string | null;
  criada: string | null;
  inicio: string | null;
  cancelada: string | null;
  no_show: boolean;
  periodo: string | null;
  valor: string | null;
  qtd_hospedes: number | null;
  doc: string | null;
}

// ── Linhas do raw ──────────────────────────────────────────────────────────
export interface Hash {
  doc_hash: string | null;
  doc_tipo: TipoDocumento | null;
  doc_key_id: string | null;
}
export interface RawEstadia {
  unidade: string;
  id_estadia: string;
  id_locacao_final: string;
  locacoes: string[];
  troca_de_suite: boolean;
  moeda: string;
  chegada_em: string;
  checkin_em: string;
  checkout_em: string;
  dia_comercial: string;
  duracao_min: number;
  tipo_periodo: string;
  categoria_id: number;
  categoria: string;
  suite: string;
  ocupantes: number | null;
  valor_permanencia: string;
  valor_ocupante_adicional: string;
  valor_consumo: string;
  valor_bruto: string;
  valor_desconto: string;
  valor_total: string;
  gorjeta: string;
  tipo_desconto: string | null;
  meios_pagamento: string[];
  meios_deposito: string[];
  tabela_preco: string | null;
  id_reserva: string | null;
  canal: string | null;
  id_funcionario: number | null;
  qtd_pessoas: number;
  flag_teste: boolean;
}
export interface RawPessoaEstadia extends Hash {
  unidade: string;
  id_estadia: string;
  id_cliente: string;
  id_pessoa: string | null;
  ordem: number;
  papel: 'titular' | 'acompanhante';
  tem_telefone: boolean;
  tem_email: boolean;
}
export interface RawCliente extends Hash {
  unidade: string;
  id_cliente: string;
  id_pessoa: string | null;
  tem_telefone: boolean;
  tem_email: boolean;
  sexo: string | null;
  ano_nascimento: number | null;
  cadastro_em: string | null;
}
export interface RawItem {
  unidade: string;
  id_item: string;
  id_estadia: string;
  id_locacao: string;
  produto_id: string;
  produto: string | null;
  tipo_produto: string | null;
  grupo: string;
  eh_pacote: boolean;
  id_item_pai: string | null;
  id_pacote: string | null;
  quantidade: string;
  valor_unitario: string;
  valor_total: string;
  lancado_em: string | null;
}
export interface RawPacote {
  unidade: string;
  id_item: string;
  id_estadia: string;
  produto: string | null;
  quantidade: string;
  valor_total: string;
}
export interface RawReserva extends Hash {
  unidade: string;
  id_reserva: string;
  id_estadia: string | null;
  id_locacao: string | null;
  id_cliente: string | null;
  canal: string | null;
  criada_em: string | null;
  inicio_em: string | null;
  cancelada_em: string | null;
  no_show: boolean;
  periodo: string | null;
  valor: string | null;
  qtd_hospedes: number | null;
  antecedencia_dias: number | null;
}
/** Conferência por dia comercial: o CRM recalcula das próprias tabelas e compara. */
export interface ChecksumDia {
  estadias: number;
  total_centavos: number;
  itens: number;
  pessoas: number;
}
export interface LoteRaw {
  estadias: RawEstadia[];
  pessoas: RawPessoaEstadia[];
  clientes: RawCliente[];
  itens: RawItem[];
  pacotes: RawPacote[];
  reservas: RawReserva[];
  checksums: Record<string, ChecksumDia>;
}

// ── Utilidades ─────────────────────────────────────────────────────────────
const centavos = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100);
const reais = (c: number) => (c / 100).toFixed(2);

/** Texto local do Automo (sem fuso) → ISO 8601 com o deslocamento do fuso da unidade. */
export function isoLocal(local: string | null, fuso: string): string | null {
  return local ? moment.tz(local, 'YYYY-MM-DDTHH:mm:ss.SSS', fuso).format('YYYY-MM-DDTHH:mm:ssZ') : null;
}

/** Dia comercial do check-out: check-out às 05:59 conta no dia anterior. */
export function diaComercial(fimLocal: string): string {
  return moment.utc(fimLocal, 'YYYY-MM-DDTHH:mm:ss.SSS').subtract(HORA_DIA_COMERCIAL, 'hours').format('YYYY-MM-DD');
}

const telefoneValido = (...v: (string | null)[]) => v.some((t) => (t ?? '').replace(/\D/g, '').length >= 10);
const emailValido = (e: string | null) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e ?? '').trim());

/**
 * Tipo de período, a MESMA regra do Analytics (determineRentalPeriod): pela
 * duração da estadia inteira (chegada → check-out) e, nas unidades com
 * Day Use/Pernoite/Diária, pela hora de chegada e de saída quando há reserva.
 */
export function tipoPeriodo(tenant: TenantConfig, chegada: string, fim: string, temReserva: boolean): string {
  const ini = moment.utc(chegada, 'YYYY-MM-DDTHH:mm:ss.SSS');
  const out = moment.utc(fim, 'YYYY-MM-DDTHH:mm:ss.SSS');
  const seg = out.diff(ini, 'seconds');
  for (const t of tenant.rentalTypes) if (seg <= t.maxSeconds) return t.type;
  const ultimo = tenant.rentalTypes[tenant.rentalTypes.length - 1].type;
  if (!tenant.extendedRentalRules || !temReserva) return ultimo;
  const hi = ini.hours();
  const ho = out.hours();
  const mo = out.minutes();
  if (hi >= 13 && ho <= 19 && mo <= 15) return 'DAY_USE';
  if (hi >= 20 && hi <= 23 && ho >= 8 && (ho < 12 || (ho === 12 && mo <= 15)) && seg >= 12 * 3600 + 15 * 60)
    return 'OVERNIGHT';
  if (seg > 16 * 3600 + 15 * 60 || (hi <= 15 && (ho > 12 || (ho === 12 && mo <= 15)))) return 'DAILY';
  return ultimo;
}

/**
 * Registro de teste (flag_teste). A regra ainda será fechada com o CRM; até
 * lá nenhuma estadia é marcada.
 */
export function ehEstadiaDeTeste(_e: Omit<RawEstadia, 'flag_teste'>): boolean {
  return false;
}

export interface EntradaTransformar {
  tenant: TenantConfig;
  chave: { id: string; segredo: string };
  estadias: LinhaEstadia[];
  pessoas: LinhaPessoa[];
  itens: LinhaItem[];
  reservas: LinhaReserva[];
  tabelas: Map<string, string>;
}

export function transformar(e: EntradaTransformar): LoteRaw {
  const un = unidadeCrm(e.tenant.slug);
  const hash = (doc: string | null): Hash => {
    const n = normalizarDocumento(doc, un.pais);
    return n
      ? { doc_hash: docHash(e.chave.segredo, n), doc_tipo: n.tipo, doc_key_id: e.chave.id }
      : { doc_hash: null, doc_tipo: null, doc_key_id: null };
  };

  // Locação (qualquer perna da cadeia) → raiz da estadia.
  const raizDe = new Map<string, string>();
  for (const s of e.estadias) for (const l of s.cadeia) raizDe.set(l, s.raiz);

  // Itens: só os das estadias do lote; somados por estadia.
  const itens: RawItem[] = [];
  const pacotes: RawPacote[] = [];
  const consumo = new Map<string, number>();
  for (const i of e.itens) {
    const raiz = raizDe.get(i.loc);
    if (!raiz) continue;
    const preco = centavos(i.preco);
    const total = Math.round(Number(i.quantidade) * preco);
    consumo.set(raiz, (consumo.get(raiz) ?? 0) + total);
    const pacote = ehPacote(un.slug, i.tipo);
    itens.push({
      unidade: un.slug,
      id_item: i.id_item,
      id_estadia: raiz,
      id_locacao: i.loc,
      produto_id: i.produto_id,
      produto: i.produto,
      tipo_produto: i.tipo,
      grupo: grupoDoItem(un.slug, i.tipo, i.produto),
      eh_pacote: pacote,
      id_item_pai: i.id_item_pai,
      id_pacote: i.id_pacote,
      quantidade: String(Number(i.quantidade)),
      valor_unitario: reais(preco),
      valor_total: reais(total),
      lancado_em: isoLocal(i.lancado, un.fuso),
    });
    if (pacote)
      pacotes.push({
        unidade: un.slug,
        id_item: i.id_item,
        id_estadia: raiz,
        produto: i.produto,
        quantidade: String(Number(i.quantidade)),
        valor_total: reais(total),
      });
  }

  // Pessoas: um registro por cliente em cada estadia (o mesmo cliente pode
  // estar em mais de uma perna da cadeia): da 1ª perna (chegada) para a última
  // e, dentro da perna, na ordem do Automo. O 1º é o titular.
  const pessoas: RawPessoaEstadia[] = [];
  const clientes = new Map<string, RawCliente>();
  const ordemCadeia = new Map<string, number>();
  for (const s of e.estadias) s.cadeia.forEach((l, i) => ordemCadeia.set(l, i));
  const porEstadia = new Map<string, LinhaPessoa[]>();
  for (const p of e.pessoas) {
    const raiz = raizDe.get(p.loc);
    if (!raiz) continue;
    const l = porEstadia.get(raiz) ?? [];
    l.push(p);
    porEstadia.set(raiz, l);
  }
  for (const [raiz, lista] of porEstadia) {
    lista.sort(
      (a, b) =>
        (ordemCadeia.get(a.loc) ?? 0) - (ordemCadeia.get(b.loc) ?? 0) ||
        Number(a.ordem ?? Infinity) - Number(b.ordem ?? Infinity) ||
        Number(a.id_cliente) - Number(b.id_cliente),
    );
    const vistos = new Set<string>();
    for (const p of lista) {
      if (vistos.has(p.id_cliente)) continue;
      vistos.add(p.id_cliente);
      const h = hash(p.doc);
      const temTel = telefoneValido(p.celular, p.telefone1, p.telefone2);
      const temEmail = emailValido(p.email);
      pessoas.push({
        unidade: un.slug,
        id_estadia: raiz,
        id_cliente: p.id_cliente,
        id_pessoa: p.id_pessoa,
        ordem: vistos.size,
        papel: vistos.size === 1 ? 'titular' : 'acompanhante',
        ...h,
        tem_telefone: temTel,
        tem_email: temEmail,
      });
      clientes.set(p.id_cliente, {
        unidade: un.slug,
        id_cliente: p.id_cliente,
        id_pessoa: p.id_pessoa,
        ...h,
        tem_telefone: temTel,
        tem_email: temEmail,
        sexo: p.sexo === 'M' || p.sexo === 'F' ? p.sexo : null,
        ano_nascimento: p.ano_nascimento,
        cadastro_em: p.cadastro_em,
      });
    }
  }

  // Reservas: a da estadia é a primeira (menor id) não cancelada ligada à cadeia.
  const reservas: RawReserva[] = [];
  const reservaDa = new Map<string, LinhaReserva>();
  for (const r of e.reservas) {
    const raiz = r.loc ? (raizDe.get(r.loc) ?? null) : null;
    if (raiz && !r.cancelada && !reservaDa.has(raiz)) reservaDa.set(raiz, r);
    const criada = r.criada ? moment.utc(r.criada, 'YYYY-MM-DDTHH:mm:ss.SSS') : null;
    const inicio = r.inicio ? moment.utc(r.inicio, 'YYYY-MM-DDTHH:mm:ss.SSS') : null;
    reservas.push({
      unidade: un.slug,
      id_reserva: r.id_reserva,
      id_estadia: raiz,
      id_locacao: r.loc,
      id_cliente: r.id_cliente,
      canal: r.canal,
      criada_em: isoLocal(r.criada, un.fuso),
      inicio_em: isoLocal(r.inicio, un.fuso),
      cancelada_em: isoLocal(r.cancelada, un.fuso),
      no_show: !!r.no_show,
      periodo: r.periodo,
      valor: r.valor,
      qtd_hospedes: r.qtd_hospedes,
      antecedencia_dias:
        criada && inicio ? inicio.clone().startOf('day').diff(criada.clone().startOf('day'), 'days') : null,
      ...hash(r.doc),
    });
  }

  const qtdPessoas = new Map<string, number>();
  for (const p of pessoas) qtdPessoas.set(p.id_estadia, (qtdPessoas.get(p.id_estadia) ?? 0) + 1);

  const estadias: RawEstadia[] = [];
  const checksums: Record<string, ChecksumDia> = {};
  for (const s of e.estadias) {
    const perm = centavos(s.perm);
    const ocup = centavos(s.ocup);
    const cons = consumo.get(s.raiz) ?? 0;
    const desc = centavos(s.descv);
    const bruto = perm + ocup + cons;
    const total = bruto - desc;
    const reserva = reservaDa.get(s.raiz) ?? null;
    const dia = diaComercial(s.fim);
    const base: Omit<RawEstadia, 'flag_teste'> = {
      unidade: un.slug,
      id_estadia: s.raiz,
      id_locacao_final: s.id_locacao,
      locacoes: s.cadeia,
      troca_de_suite: s.cadeia.length > 1,
      moeda: un.moeda,
      chegada_em: isoLocal(s.chegada, un.fuso)!,
      checkin_em: isoLocal(s.ini, un.fuso)!,
      checkout_em: isoLocal(s.fim, un.fuso)!,
      dia_comercial: dia,
      duracao_min: Math.round(
        moment.utc(s.fim, 'YYYY-MM-DDTHH:mm:ss.SSS').diff(moment.utc(s.chegada, 'YYYY-MM-DDTHH:mm:ss.SSS'), 'seconds') / 60,
      ),
      tipo_periodo: tipoPeriodo(e.tenant, s.chegada, s.fim, reserva !== null),
      categoria_id: s.categoria_id,
      categoria: s.categoria,
      suite: s.suite,
      ocupantes: s.ocupantes,
      valor_permanencia: reais(perm),
      valor_ocupante_adicional: reais(ocup),
      valor_consumo: reais(cons),
      valor_bruto: reais(bruto),
      valor_desconto: reais(desc),
      valor_total: reais(total),
      gorjeta: reais(centavos(s.gorjeta)),
      tipo_desconto: desc > 0 ? s.tipo_desc : null,
      meios_pagamento: [...(s.meios ?? [])].sort(),
      meios_deposito: [...(s.meios_dep ?? [])].sort(),
      tabela_preco: e.tabelas.get(s.raiz) ?? e.tabelas.get(s.id_locacao) ?? null,
      id_reserva: reserva?.id_reserva ?? null,
      canal: reserva?.canal ?? null,
      id_funcionario: s.funcionario,
      qtd_pessoas: qtdPessoas.get(s.raiz) ?? 0,
    };
    estadias.push({ ...base, flag_teste: ehEstadiaDeTeste(base) });
    const c = (checksums[dia] ??= { estadias: 0, total_centavos: 0, itens: 0, pessoas: 0 });
    c.estadias++;
    c.total_centavos += total;
    c.pessoas += qtdPessoas.get(s.raiz) ?? 0;
  }
  const diaDa = new Map(estadias.map((s) => [s.id_estadia, s.dia_comercial]));
  for (const i of itens) checksums[diaDa.get(i.id_estadia)!].itens++;

  return { estadias, pessoas, clientes: [...clientes.values()], itens, pacotes, reservas, checksums };
}
