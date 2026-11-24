// Job do CRM no lhg-api (Automo → schema raw do Supabase do CRM):
// configuração, doc_hash, transformação, destino FALSO (memória), agendador
// (histórico em blocos + incremental com releitura) e — se houver
// TEST_DATABASE_URL — o gravador Pg de verdade num schema descartável.
// Pool do Automo FALSO; CPFs/cédulas GERADOS aqui (dígitos aleatórios com DV
// calculado), nomes/telefones/e-mails FICTÍCIOS. Rodar depois do build.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../lhg-api/package.json", import.meta.url));
require("reflect-metadata");
const cfgm = require("../lhg-api/dist/crm-etl/crm-etl.config.js");
const doc = require("../lhg-api/dist/crm-etl/crm-etl.doc.js");
const tr = require("../lhg-api/dist/crm-etl/crm-etl.transformar.js");
const raw = require("../lhg-api/dist/crm-etl/crm-etl.raw.js");
const dst = require("../lhg-api/dist/crm-etl/crm-etl.destino.js");
const { CrmEtlService } = require("../lhg-api/dist/crm-etl/crm-etl.service.js");
const { getTenant } = require("../lhg-api/dist/tenant/tenant.registry.js");

const segredo = () => crypto.randomBytes(32).toString("hex");
const CHAVE = { id: "k1", segredo: segredo() };
const config = (extra = {}) =>
  cfgm.lerConfigCrmEtl({ CRM_ETL_DATABASE_URL: "postgres://falso", CRM_DOC_HMAC_KEYS: `k1:${CHAVE.segredo}`, ...extra });

/** CPF válido GERADO (9 dígitos aleatórios + DV). */
function cpfGerado() {
  for (;;) {
    const b = Array.from({ length: 9 }, () => crypto.randomInt(10));
    const dv = (arr) => {
      const n = arr.length;
      const s = arr.reduce((acc, d, i) => acc + d * (n + 1 - i), 0);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    b.push(dv(b));
    b.push(dv(b));
    const d = b.join("");
    if (!/^(\d)\1{10}$/.test(d)) return d;
  }
}
/** Cédula equatoriana válida GERADA (província 17, módulo 10). */
function cedulaGerada() {
  const b = [1, 7, crypto.randomInt(6), ...Array.from({ length: 6 }, () => crypto.randomInt(10))];
  const s = b.reduce((acc, d, i) => {
    let v = d * (i % 2 === 0 ? 2 : 1);
    if (v > 9) v -= 9;
    return acc + v;
  }, 0);
  return [...b, (10 - (s % 10)) % 10].join("");
}
const mascara = (c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;

const NOME = "Pessoa Ficticia Alfa";
const TEL = "(11) 90000-0001";
const EMAIL = "ficticio@example.com";

// ── Configuração ─────────────────────────────────────────────────────────────
describe("configuração", () => {
  test("desligado sem URL ou sem chave; chave curta não serve", () => {
    assert.equal(cfgm.lerConfigCrmEtl({}).ativo, false);
    assert.equal(cfgm.lerConfigCrmEtl({ CRM_ETL_DATABASE_URL: "postgres://x" }).ativo, false);
    assert.equal(cfgm.lerConfigCrmEtl({ CRM_ETL_DATABASE_URL: "postgres://x", CRM_DOC_HMAC_KEYS: "k1:curta" }).ativo, false);
    const c = config();
    assert.equal(c.ativo, true);
    assert.deepEqual(c.unidades, ["lush_ipiranga", "lush_lapa", "tout", "andar_de_cima", "liv", "altana"]);
    assert.equal(c.schema, "raw");
    assert.deepEqual(c.janela, [2, 6]);
    assert.equal(c.reprocessarDias, 7);
  });
  test("rotação: a 1ª chave é a atual", () => {
    const c = cfgm.lerConfigCrmEtl({ CRM_ETL_DATABASE_URL: "x", CRM_DOC_HMAC_KEYS: `k2:${segredo()},k1:${segredo()}` });
    assert.equal(c.chave.id, "k2");
  });
  test("recusa GETAN, schema e janela inválidos", () => {
    assert.equal(config({ CRM_ETL_UNIDADES: "tout,getan_grid" }).ativo, false);
    assert.equal(config({ CRM_ETL_SCHEMA: "raw; drop" }).ativo, false);
    assert.equal(config({ CRM_ETL_JANELA: "3-3" }).ativo, false);
    assert.equal(config({ CRM_ETL_REPROCESSAR_DIAS: "40" }).ativo, false);
  });
  test("janela que vira a meia-noite", () => {
    assert.equal(cfgm.dentroDaJanela(23, [22, 4]), true);
    assert.equal(cfgm.dentroDaJanela(3, [22, 4]), true);
    assert.equal(cfgm.dentroDaJanela(4, [22, 4]), false);
    assert.equal(cfgm.dentroDaJanela(2, [2, 6]), true);
    assert.equal(cfgm.dentroDaJanela(6, [2, 6]), false);
  });
});

// ── Documento ────────────────────────────────────────────────────────────────
describe("doc_hash", () => {
  test("CPF com máscara e sem máscara → mesmo hash; país no prefixo", () => {
    const c = cpfGerado();
    const a = doc.normalizarDocumento(mascara(c), "BR");
    const b = doc.normalizarDocumento(c, "BR");
    assert.equal(a.tipo, "CPF");
    assert.equal(doc.docHash(CHAVE.segredo, a), doc.docHash(CHAVE.segredo, b));
    assert.match(doc.docHash(CHAVE.segredo, a), /^[0-9a-f]{64}$/);
    // Outra chave → outro hash (sem a chave do CRM o hash não serve para nada).
    assert.notEqual(doc.docHash(segredo(), a), doc.docHash(CHAVE.segredo, a));
  });
  test("recusa DV errado, dígitos repetidos e lixo", () => {
    const c = cpfGerado();
    const errado = c.slice(0, 10) + String((Number(c[10]) + 1) % 10);
    assert.equal(doc.normalizarDocumento(errado, "BR"), null);
    assert.equal(doc.normalizarDocumento("111.111.111-11", "BR"), null);
    assert.equal(doc.normalizarDocumento("ABC", "BR"), null);
    assert.equal(doc.normalizarDocumento(null, "BR"), null);
  });
  test("cédula só no Equador (LIV); CPF continua valendo lá", () => {
    const ced = cedulaGerada();
    assert.equal(doc.normalizarDocumento(ced, "EC").tipo, "CEDULA_EC");
    assert.equal(doc.normalizarDocumento(ced, "BR"), null);
    assert.equal(doc.normalizarDocumento(cpfGerado(), "EC").tipo, "CPF");
  });
});

// ── Transformação ────────────────────────────────────────────────────────────
const ESTADIA = (o) => ({
  id_locacao: "5002",
  raiz: "5001",
  cadeia: ["5001", "5002"],
  chegada: "2026-11-15T22:00:00.000",
  ini: "2026-11-15T23:00:00.000",
  fim: "2026-11-16T05:30:00.000",
  perm: "200.00",
  ocup: "50.00",
  descv: "20.00",
  gorjeta: "10.00",
  tipo_desc: "VALOR",
  ocupantes: 2,
  categoria_id: 10,
  categoria: "LUXO",
  suite: "101",
  funcionario: 7,
  meios: ["PIX"],
  meios_dep: null,
  ...o,
});

function entrada(cpfA, cpfB, slug = "lush_ipiranga") {
  return {
    tenant: getTenant(slug),
    chave: CHAVE,
    estadias: [ESTADIA(), ESTADIA({ id_locacao: "6000", raiz: "6000", cadeia: ["6000"], chegada: "2026-11-16T10:00:00.000", ini: "2026-11-16T10:00:00.000", fim: "2026-11-16T12:00:00.000", descv: "0", meios: null, meios_dep: ["DINHEIRO"] })],
    pessoas: [
      // Acompanhante na última perna e titular na 1ª (chegada): titular = o da 1ª perna.
      { loc: "5002", id_cliente: "902", ordem: 1, id_pessoa: "802", doc: cpfB, celular: null, telefone1: null, telefone2: null, email: null, sexo: "F", ano_nascimento: 1990, cadastro_em: null },
      { loc: "5001", id_cliente: "901", ordem: 1, id_pessoa: "801", doc: mascara(cpfA), celular: TEL, telefone1: null, telefone2: null, email: EMAIL, sexo: "M", ano_nascimento: 1985, cadastro_em: "2025-01-01T12:00:00Z" },
      // O mesmo cliente nas duas pernas: um registro só.
      { loc: "5002", id_cliente: "901", ordem: 2, id_pessoa: "801", doc: mascara(cpfA), celular: TEL, telefone1: null, telefone2: null, email: EMAIL, sexo: "M", ano_nascimento: 1985, cadastro_em: "2025-01-01T12:00:00Z" },
      // Locação fora do lote: ignorada.
      { loc: "9999", id_cliente: "999", ordem: 1, id_pessoa: "899", doc: null, celular: null, telefone1: null, telefone2: null, email: null, sexo: null, ano_nascimento: null, cadastro_em: null },
    ],
    itens: [
      { loc: "5002", id_item: "1", id_item_pai: null, id_pacote: null, produto_id: "11", produto: "CERVEJA X", tipo: "02 - CERVEJAS", quantidade: "2", preco: "15.50", lancado: "2026-11-16T00:10:00.000" },
      { loc: "5002", id_item: "2", id_item_pai: null, id_pacote: "3", produto_id: "12", produto: "PACOTE ROMANTICO", tipo: "PACOTE DE PRODUTOS", quantidade: "1", preco: "100.00", lancado: null },
      { loc: "6000", id_item: "3", id_item_pai: null, id_pacote: null, produto_id: "13", produto: "AGUA", tipo: "01 - AGUAS", quantidade: "1", preco: "5.00", lancado: null },
    ],
    reservas: [
      { id_reserva: "70", loc: "5001", id_cliente: "901", canal: "SITE", criada: "2026-11-10T09:00:00.000", inicio: "2026-11-15T22:00:00.000", cancelada: null, no_show: false, periodo: "PERNOITE", valor: "300.00", qtd_hospedes: 2, doc: cpfA },
      { id_reserva: "71", loc: null, id_cliente: "903", canal: "SITE", criada: "2026-11-14T09:00:00.000", inicio: "2026-11-16T14:00:00.000", cancelada: "2026-11-15T09:00:00.000", no_show: false, periodo: null, valor: null, qtd_hospedes: null, doc: null },
    ],
    tabelas: new Map([["5001", "TABELA PADRAO"]]),
  };
}

describe("transformar", () => {
  const cpfA = cpfGerado();
  const cpfB = cpfGerado();
  const lote = tr.transformar(entrada(cpfA, cpfB));

  test("NENHUM dado pessoal sai: sem documento, nome, telefone ou e-mail", () => {
    const tudo = JSON.stringify(lote);
    for (const proibido of [cpfA, mascara(cpfA), cpfB, NOME, TEL, EMAIL]) assert.ok(!tudo.includes(proibido));
    const hashA = doc.docHash(CHAVE.segredo, doc.normalizarDocumento(cpfA, "BR"));
    assert.ok(tudo.includes(hashA));
  });

  test("estadia = raiz da cadeia; valores, troca, período e dia comercial", () => {
    const e = lote.estadias.find((x) => x.id_estadia === "5001");
    assert.equal(e.id_locacao_final, "5002");
    assert.deepEqual(e.locacoes, ["5001", "5002"]);
    assert.equal(e.troca_de_suite, true);
    assert.equal(e.valor_consumo, "131.00"); // 2 × 15,50 + 100
    assert.equal(e.valor_bruto, "381.00");
    assert.equal(e.valor_total, "361.00");
    assert.equal(e.moeda, "BRL");
    assert.equal(e.chegada_em, "2026-11-15T22:00:00-03:00");
    // Check-out às 05:30 conta no dia comercial anterior.
    assert.equal(e.dia_comercial, "2026-11-15");
    assert.equal(e.duracao_min, 450);
    // Com reserva, chegada 22h e saída 05:30 (7h30): 12 horas pela duração.
    assert.equal(e.tipo_periodo, "TWELVE_HOURS");
    assert.equal(e.id_reserva, "70");
    assert.equal(e.canal, "SITE");
    assert.equal(e.tabela_preco, "TABELA PADRAO");
    assert.equal(e.qtd_pessoas, 2);
    assert.equal(e.flag_teste, false);
    const s = lote.estadias.find((x) => x.id_estadia === "6000");
    assert.equal(s.tipo_desconto, null);
    assert.deepEqual(s.meios_deposito, ["DINHEIRO"]);
    assert.equal(s.dia_comercial, "2026-11-16");
  });

  test("pessoas: todos os ligados, sem repetir, titular da 1ª perna", () => {
    const p = lote.pessoas.filter((x) => x.id_estadia === "5001");
    assert.deepEqual(p.map((x) => [x.id_cliente, x.ordem, x.papel]), [["901", 1, "titular"], ["902", 2, "acompanhante"]]);
    assert.equal(p[0].tem_telefone, true);
    assert.equal(p[0].tem_email, true);
    assert.equal(p[1].tem_telefone, false);
    assert.equal(p[0].doc_key_id, "k1");
    assert.equal(lote.clientes.length, 2);
    assert.ok(!lote.pessoas.some((x) => x.id_cliente === "999"));
  });

  test("itens como linhas, grupo e pacote", () => {
    assert.deepEqual(lote.itens.map((i) => [i.id_item, i.id_estadia, i.grupo, i.eh_pacote, i.valor_total]), [
      ["1", "5001", "Cervejas", false, "31.00"],
      ["2", "5001", "Pacotes_Decoracao_Servicos", true, "100.00"],
      ["3", "6000", "Bebidas_Nao_Alcoolicas", false, "5.00"],
    ]);
    assert.deepEqual(lote.pacotes.map((p) => [p.id_item, p.id_estadia]), [["2", "5001"]]);
  });

  test("reservas: ligada à estadia e cancelada sem estadia", () => {
    const r70 = lote.reservas.find((r) => r.id_reserva === "70");
    assert.equal(r70.id_estadia, "5001");
    assert.equal(r70.antecedencia_dias, 5);
    assert.ok(r70.doc_hash);
    const r71 = lote.reservas.find((r) => r.id_reserva === "71");
    assert.equal(r71.id_estadia, null);
    assert.equal(r71.cancelada_em, "2026-11-15T09:00:00-03:00");
    assert.equal(r71.doc_hash, null);
  });

  test("checksums por dia comercial", () => {
    assert.deepEqual(lote.checksums, {
      "2026-11-15": { estadias: 1, total_centavos: 36100, itens: 2, pessoas: 2 },
      "2026-11-16": { estadias: 1, total_centavos: 25500, itens: 1, pessoas: 0 },
    });
  });

  test("LIV: USD, fuso de Guayaquil e cédula", () => {
    const ced = cedulaGerada();
    const e = entrada(cpfGerado(), cpfGerado(), "liv");
    e.pessoas[1].doc = ced;
    const l = tr.transformar(e);
    assert.equal(l.estadias[0].moeda, "USD");
    assert.equal(l.estadias[0].chegada_em, "2026-11-15T22:00:00-05:00");
    assert.equal(l.pessoas.find((p) => p.id_cliente === "901").doc_tipo, "CEDULA_EC");
    assert.ok(!JSON.stringify(l).includes(ced));
  });

  test("tipo de período: Altana (1/2/4/12h) e Day Use com reserva", () => {
    const alt = getTenant("altana");
    assert.equal(tr.tipoPeriodo(alt, "2026-11-16T10:00:00.000", "2026-11-16T11:10:00.000", false), "ONE_HOUR");
    assert.equal(tr.tipoPeriodo(alt, "2026-11-16T10:00:00.000", "2026-11-16T13:00:00.000", true), "FOUR_HOURS");
    const ipi = getTenant("lush_ipiranga");
    assert.equal(tr.tipoPeriodo(ipi, "2026-11-16T05:00:00.000", "2026-11-16T19:00:00.000", true), "DAILY");
    assert.equal(tr.tipoPeriodo(ipi, "2026-11-16T05:00:00.000", "2026-11-16T19:00:00.000", false), "TWELVE_HOURS");
  });
});

// ── Destino falso ────────────────────────────────────────────────────────────
const exec = (o = {}) => ({ id: crypto.randomUUID(), unidade: "lush_ipiranga", modo: "incremental", desde: "2026-11-15T00:00:00.000", ate: "2026-11-17T00:00:00.000", iniciadoEm: new Date(), ...o });

describe("destino (memória)", () => {
  test("releitura: item cancelado e acompanhante removido somem; reserva não perde a estadia", async () => {
    const d = new dst.DestinoMemoria();
    const e = entrada(cpfGerado(), cpfGerado());
    await d.gravar(exec(), tr.transformar(e));
    assert.equal(d.linhas("itens_consumo").length, 3);
    assert.equal(d.linhas("pessoas_estadia").length, 2);

    e.itens = e.itens.filter((i) => i.id_item !== "1");
    e.pessoas = e.pessoas.filter((p) => p.id_cliente !== "902");
    // A reserva 70 relida pela DATA, sem a estadia no lote: mantém o id_estadia.
    const e2 = { ...e, reservas: [{ ...e.reservas[0], loc: "5001" }], estadias: e.estadias.filter((s) => s.raiz === "5001") };
    await d.gravar(exec(), tr.transformar(e2));
    const so70 = { ...e, estadias: [], itens: [], pessoas: [], reservas: [e.reservas[0]] };
    await d.gravar(exec(), tr.transformar(so70));
    assert.deepEqual(d.linhas("itens_consumo").map((i) => i.id_item).sort(), ["2", "3"]);
    assert.deepEqual(d.linhas("pessoas_estadia").map((p) => p.id_cliente), ["901"]);
    assert.equal(d.linhas("reservas").find((r) => r.id_reserva === "70").id_estadia, "5001");
    assert.equal(d.linhas("estadias").length, 2);
  });

  test("tudo ou nada: falha numa tabela não grava nada nem avança a marca d'água", async () => {
    const d = new dst.DestinoMemoria();
    d.falharEm = "itens_consumo";
    await assert.rejects(d.gravar(exec(), tr.transformar(entrada(cpfGerado(), cpfGerado()))));
    assert.equal(d.linhas("estadias").length, 0);
    assert.equal(await d.marcaDagua("lush_ipiranga"), null);
  });
});

// ── Agendador (pool falso) ───────────────────────────────────────────────────
function poolFalso(estadias) {
  const chamadas = [];
  return {
    chamadas,
    async query(_slug, sql) {
      assert.match(sql, /has_table_privilege/);
      return [{ tem_ordem: true, pode_tabela: false }];
    },
    async queryWithParams(slug, sql, params) {
      chamadas.push({ slug, sql: sql.slice(0, 40), params });
      if (sql.includes("WITH RECURSIVE fin")) return estadias.filter((e) => e.fim >= params[0] && e.fim < params[1]);
      return [];
    },
  };
}
const ms = (iso) => Date.parse(iso);

describe("agendador", () => {
  test("histórico em blocos de 1 mês e depois o incremental com releitura de 7 dias", async () => {
    const pool = poolFalso([ESTADIA({ fim: "2026-10-10T12:00:00.000" }), ESTADIA({ id_locacao: "7", raiz: "7", cadeia: ["7"], fim: "2026-11-20T12:00:00.000" })]);
    const d = new dst.DestinoMemoria();
    const s = new CrmEtlService(pool, d, config({ CRM_ETL_UNIDADES: "tout", CRM_ETL_BACKFILL_DESDE: "2026-08-01" }));
    const agora = ms("2026-11-24T03:00:00-03:00");
    s.relogio = () => agora;
    await s.ciclo(agora);
    const janelas = d.runs.map((r) => [r.modo, r.desde.slice(0, 10), r.ate.slice(0, 16)]);
    assert.deepEqual(janelas, [
      ["backfill", "2026-08-01", "2026-09-01T00:00"],
      ["backfill", "2026-09-01", "2026-10-01T00:00"],
      ["backfill", "2026-10-01", "2026-11-01T00:00"],
      ["backfill", "2026-11-01", "2026-11-24T03:00"],
      ["incremental", "2026-11-17", "2026-11-24T03:00"],
    ]);
    assert.equal(d.linhas("estadias").length, 2);
    // Mesmo dia: o incremental não repete.
    await s.ciclo(agora + 10 * 60_000);
    assert.equal(d.runs.length, 5);
  });

  test("fora da janela não lê o Automo", async () => {
    const pool = poolFalso([]);
    const s = new CrmEtlService(pool, new dst.DestinoMemoria(), config());
    await s.ciclo(ms("2026-11-24T14:00:00-03:00"));
    assert.equal(pool.chamadas.length, 0);
  });

  test("erro: registra só o código, não avança a marca e segue para a próxima unidade", async () => {
    const d = new dst.DestinoMemoria();
    const pool = poolFalso([]);
    const orig = pool.queryWithParams;
    pool.queryWithParams = async (slug, sql, params) => {
      if (slug === "tout") throw Object.assign(new Error(`falhou com o CPF ${cpfGerado()}`), { code: "57014" });
      return orig(slug, sql, params);
    };
    const s = new CrmEtlService(pool, d, config({ CRM_ETL_UNIDADES: "tout,altana", CRM_ETL_BACKFILL_DESDE: "2026-11-20" }));
    const agora = ms("2026-11-24T03:00:00-03:00");
    s.relogio = () => agora;
    await s.ciclo(agora);
    const erro = d.runs.find((r) => r.status === "erro");
    assert.equal(erro.unidade, "tout");
    assert.equal(erro.erro, "Error:57014");
    assert.equal(await d.marcaDagua("tout"), null);
    assert.ok(await d.marcaDagua("altana"));
  });
});

// ── Gravador Pg (só com TEST_DATABASE_URL; no CI, o Postgres do job) ─────────
describe("destino Pg", { skip: !process.env.TEST_DATABASE_URL && "sem TEST_DATABASE_URL" }, () => {
  const schema = `crm_raw_teste_${crypto.randomBytes(4).toString("hex")}`;
  let pg;
  let d;
  after(async () => {
    if (!pg) return;
    await d?.fechar();
    const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await c.end();
  });

  test("DDL proposta + gravação, releitura e marca d'água", async () => {
    pg = require("pg");
    const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    await c.query(raw.ddlRaw(schema));
    d = new dst.DestinoPg(process.env.TEST_DATABASE_URL, schema);
    const e = entrada(cpfGerado(), cpfGerado());
    const cont = await d.gravar(exec(), tr.transformar(e));
    assert.deepEqual(cont, { estadias: 2, clientes: 2, pessoas: 2, itens: 3, pacotes: 1, reservas: 2 });
    e.itens = e.itens.filter((i) => i.id_item !== "1");
    await d.gravar(exec({ ate: "2026-11-18T00:00:00.000" }), tr.transformar(e));
    await d.gravar(exec({ ate: "2026-11-18T00:00:00.000" }), tr.transformar({ ...e, estadias: [], itens: [], pessoas: [], reservas: [{ ...e.reservas[0] }] }));
    const q = async (s) => (await c.query(s)).rows;
    assert.deepEqual((await q(`SELECT id_item FROM ${schema}.itens_consumo ORDER BY 1`)).map((r) => r.id_item), ["2", "3"]);
    const [e1] = await q(`SELECT valor_total::text, dia_comercial::text, chegada_em AT TIME ZONE 'UTC' AS chegada, locacoes FROM ${schema}.estadias WHERE id_estadia = 5001`);
    assert.equal(e1.valor_total, "330.00");
    assert.equal(e1.dia_comercial, "2026-11-15");
    assert.deepEqual(e1.locacoes, ["5001", "5002"]);
    const [r70] = await q(`SELECT id_estadia::text FROM ${schema}.reservas WHERE id_reserva = 70`);
    assert.equal(r70.id_estadia, "5001");
    assert.equal(await d.marcaDagua("lush_ipiranga"), "2026-11-18T00:00:00.000");
    const [run] = await q(`SELECT status, contagens->>'itens' AS itens FROM ${schema}.etl_runs ORDER BY terminado_em LIMIT 1`);
    assert.deepEqual(run, { status: "ok", itens: "3" });
    await c.end();
  });
});
