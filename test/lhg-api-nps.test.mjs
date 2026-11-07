// API servidor-a-servidor do NPS no lhg-api:
//   A: GET /nps/v1/estadia (suite ou raiz)   B: GET /nps/v1/checkouts
//   C: GET /nps/v1/contato (só a chave de escopo 'contato', a do Chat LHG)
// HMAC e escopo, validação das consultas, regras (com um pool FALSO, sem banco)
// e o HTTP de ponta a ponta. Segredos e telefones de TESTE, gerados/fictícios.
// Rodar depois do build: node --test test/
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../lhg-api/package.json", import.meta.url));
require("reflect-metadata");
const { NestFactory } = require("@nestjs/core");
const { Module } = require("@nestjs/common");
const hmac = require("../lhg-api/dist/nps/nps-hmac.js");
const est = require("../lhg-api/dist/nps/nps-estadia.js");
const svc = require("../lhg-api/dist/nps/nps.service.js");
const { NpsController } = require("../lhg-api/dist/nps/nps.controller.js");
const { NpsHmacGuard } = require("../lhg-api/dist/nps/nps-hmac.guard.js");
const { TenantPoolService } = require("../lhg-api/dist/database/tenant-pool.service.js");

const segredo = () => crypto.randomBytes(32).toString("hex");
const S1 = segredo();
const S2 = segredo();
const SC = segredo(); // chave do Chat LHG (escopo contato)
// Telefone FICTÍCIO (faixa de teste), no formato em que o Automo grava.
const TEL_FICTICIO = "(11) 90000-0001";
const E164_FICTICIO = "+5511900000001";

// ── Pool falso ──────────────────────────────────────────────────────────────
// Suítes 101 (ativa, cadeia 4990→5001), 102 (finalizada 10:00), 103 (vazia),
// 201 (suíte ATUAL da cadeia 4990 depois da troca... ver SQL_SUITE_ATUAL_DA_CADEIA).
function poolFalso() {
  const chamadas = [];
  const suites = { 101: 11, 102: 12, 103: 13, 201: 21 };
  const ativas = { 11: { ref: "5001", inicio: "2026-11-07T09:30:00.000" } };
  const ultimas = {
    12: { ref: "5002", inicio: "2026-11-07T08:00:00.000", fim: "2026-11-07T10:00:00.000" },
  };
  const cadeias = { 5001: { raiz: "4990", tem_reserva: true }, 5002: { raiz: "5002", tem_reserva: false } };
  const suiteAtual = { 4990: 101, 5001: 101, 5002: 102, 7000: 555 };
  const checkouts = [
    { ref: "6001", suite: 101, inicio: "2026-11-07T08:00:00.000", fim: "2026-11-07T10:00:00.000", raiz: "6000", tipo_origem: "RESERVA_API", reserva_canal_ref: "0f5e2a9c-0000-4000-8000-000000000001", tem_contato: true },
    { ref: "6002", suite: 102, inicio: "2026-11-07T08:30:00.000", fim: "2026-11-07T10:00:00.000", raiz: null, tipo_origem: null, reserva_canal_ref: null, tem_contato: false },
    { ref: "6003", suite: 103, inicio: "2026-11-07T09:00:00.123", fim: "2026-11-07T11:15:30.456", raiz: "6003", tipo_origem: "GUIA_DE_MOTEIS", reserva_canal_ref: "998877", tem_contato: false },
  ];
  // Endpoint C: 8001 ok (telefone1), 8002 só fixo, 8003 balcão, 8004 antiga, 8005 transferida, 8006 celular com +55
  const contatos = {
    8001: { finalizada: true, liberada: true, tipo_origem: "RESERVA_API", celular: "", telefone1: TEL_FICTICIO, telefone2: null },
    8002: { finalizada: true, liberada: true, tipo_origem: "RESERVA_API", celular: null, telefone1: "(11) 3000-0000", telefone2: null },
    8003: { finalizada: true, liberada: true, tipo_origem: null, celular: null, telefone1: null, telefone2: null },
    8004: { finalizada: true, liberada: false, tipo_origem: "RESERVA_API", celular: null, telefone1: null, telefone2: null },
    8005: { finalizada: false, liberada: false, tipo_origem: null, celular: null, telefone1: null, telefone2: null },
    8006: { finalizada: true, liberada: true, tipo_origem: "GUIA_DE_MOTEIS", celular: "+55 11 90000-0002", telefone1: null, telefone2: null },
  };
  return {
    chamadas,
    async queryWithParams(slug, sql, params) {
      chamadas.push({ slug, sql, params });
      if (sql === svc.SQL_SUITE) {
        const id = suites[params[0]];
        assert.ok(Array.isArray(params[1]) && params[1].length > 0, "categorias da unidade");
        return id ? [{ id }] : [];
      }
      if (sql === svc.SQL_SUITE_ATUAL_DA_CADEIA) return suiteAtual[params[0]] ? [{ numero: suiteAtual[params[0]] }] : [];
      if (sql === svc.SQL_ATIVA) return ativas[params[0]] ? [ativas[params[0]]] : [];
      if (sql === svc.SQL_ULTIMA_FINALIZADA) {
        const u = ultimas[params[0]];
        // o banco compara datafinaldaocupacao >= $2 (texto local, sem fuso)
        return u ? [{ ...u, na_janela: u.fim.replace("T", " ") >= params[1] }] : [];
      }
      if (sql === svc.SQL_CADEIA) return [cadeias[params[0]]];
      if (sql === svc.SQL_CHECKOUTS) {
        const [desde, apos, limite, cats, padrao] = params;
        assert.ok(Array.isArray(cats) && cats.length > 0);
        assert.equal(padrao, est.CELULAR_BR_DIGITOS);
        return checkouts
          .filter((c) => {
            const f = c.fim.replace("T", " ");
            return f > desde || (f === desde.slice(0, 23) && Number(c.ref) > Number(apos));
          })
          .slice(0, limite);
      }
      if (sql === svc.SQL_CONTATO) return contatos[params[0]] ? [contatos[params[0]]] : [];
      throw new Error("SQL inesperado");
    },
  };
}

// 2026-11-07 12:00 em São Paulo (= 15:00Z)
const AGORA = "2026-11-07T12:00:00-03:00";
const AGORA_MS = Date.parse(AGORA);
const consulta = (suite, janela) => {
  const r = est.lerConsultaEstadia(
    { unidade: "lush_ipiranga", suite: String(suite), agora: AGORA, ...(janela == null ? {} : { janela_min: String(janela) }) },
    AGORA_MS,
  );
  assert.ok(r.ok, r.erro);
  return r.consulta;
};
const consultaRaiz = (raiz, janela = 120) => {
  const r = est.lerConsultaEstadia({ unidade: "lush_ipiranga", raiz, agora: AGORA, janela_min: String(janela) }, AGORA_MS);
  assert.ok(r.ok, r.erro);
  return r.consulta;
};

describe("HMAC e escopo (nps-hmac)", () => {
  test("NPS_HMAC_KEYS: escopo opcional (padrão nps); id, segredo, escopo ou campos a mais inválidos são ignorados", () => {
    const { chaves, invalidas } = hmac.lerChavesNps(
      ` k1:${S1} , k2:${S2}:nps,chat:${SC}:contato,x y:${S1},k3:curto,k1:${S2},:${S1},k4:${S1}:admin,k5:${S1}:nps:extra`,
    );
    assert.deepEqual([...chaves.keys()], ["k1", "k2", "chat"]);
    assert.deepEqual(chaves.get("k1"), { segredo: S1, escopo: "nps" });
    assert.equal(chaves.get("chat").escopo, "contato");
    assert.equal(invalidas, 6);
    assert.equal(hmac.lerChavesNps(undefined).chaves.size, 0);
  });

  const chaves = new Map([["k1", { segredo: S1, escopo: "nps" }], ["k2", { segredo: S2, escopo: "nps" }], ["chat", { segredo: SC, escopo: "contato" }]]);
  const CAM = "/nps/v1/estadia?unidade=lush_ipiranga&suite=101";
  const ts = String(Math.floor(AGORA_MS / 1000));
  const base = (o = {}) => ({
    chaves,
    keyId: "k1",
    timestamp: ts,
    assinatura: hmac.assinarNps(S1, "GET", CAM, ts),
    metodo: "GET",
    caminho: CAM,
    agoraMs: AGORA_MS,
    ...o,
  });

  test("assinatura correta → ok com o escopo da chave (e a 2ª chave também vale: rotação)", () => {
    assert.deepEqual(hmac.verificarNps(base()), { ok: true, keyId: "k1", escopo: "nps" });
    assert.equal(hmac.verificarNps(base({ keyId: "k2", assinatura: hmac.assinarNps(S2, "GET", CAM, ts) })).ok, true);
    assert.deepEqual(hmac.verificarNps(base({ keyId: "chat", assinatura: hmac.assinarNps(SC, "GET", CAM, ts) })), {
      ok: true,
      keyId: "chat",
      escopo: "contato",
    });
    assert.equal(hmac.verificarNps(base({ assinatura: base().assinatura.toUpperCase() })).ok, true);
  });

  test("recusas: sem config, cabeçalhos, caminho, chave, relógio e assinatura", () => {
    const motivo = (o) => hmac.verificarNps(base(o)).motivo;
    assert.equal(motivo({ chaves: new Map() }), "sem_config");
    assert.equal(motivo({ keyId: undefined }), "cabecalhos");
    assert.equal(motivo({ timestamp: "12a" }), "cabecalhos");
    assert.equal(motivo({ assinatura: "xyz" }), "cabecalhos");
    assert.equal(motivo({ assinatura: ["a"] }), "cabecalhos");
    assert.equal(motivo({ caminho: "/lhg" + CAM }), "caminho");
    assert.equal(motivo({ keyId: "k9" }), "chave");
    assert.equal(motivo({ agoraMs: AGORA_MS + 301_000 }), "relogio");
    assert.equal(motivo({ agoraMs: AGORA_MS - 301_000 }), "relogio");
    assert.equal(hmac.verificarNps(base({ agoraMs: AGORA_MS + 299_000 })).ok, true);
    assert.equal(motivo({ assinatura: hmac.assinarNps(S2, "GET", CAM, ts) }), "assinatura");
    assert.equal(motivo({ caminho: CAM.replace("101", "102") }), "assinatura");
    assert.equal(motivo({ metodo: "POST" }), "assinatura");
    assert.equal(motivo({ corpo: "{}" }), "assinatura");
  });
});

describe("consultas (nps-estadia)", () => {
  test("A: janela padrão 120 min, limite na hora LOCAL do Automo (sem fuso)", () => {
    const c = consulta(101);
    assert.equal(c.tenant.slug, "lush_ipiranga");
    assert.equal(c.suite, 101);
    assert.equal(c.raiz, null);
    assert.equal(c.janelaMin, 120);
    assert.equal(c.limiteLocal, "2026-11-07 10:00:00.000");
    assert.equal(consulta(101, 0).limiteLocal, "2026-11-07 12:00:00.000");
    const r = est.lerConsultaEstadia({ unidade: "lush_ipiranga", suite: "101", agora: "2026-11-07T15:00:00Z", janela_min: "60" }, AGORA_MS);
    assert.equal(r.consulta.limiteLocal, "2026-11-07 11:00:00.000");
    const porRaiz = consultaRaiz("4990");
    assert.equal(porRaiz.suite, null);
    assert.equal(porRaiz.raiz, "4990");
  });

  test("A inválida → erro (sem consulta ao banco)", () => {
    const erro = (q) => est.lerConsultaEstadia({ unidade: "lush_ipiranga", suite: "101", agora: AGORA, ...q }, AGORA_MS).erro;
    assert.match(erro({ unidade: "lush-ipiranga" }), /unidade/);
    assert.match(erro({ unidade: undefined }), /unidade/);
    assert.match(erro({ suite: "10a" }), /suite/);
    assert.match(erro({ suite: ["101"] }), /suite/);
    assert.match(erro({ suite: undefined }), /suite OU raiz/);
    assert.match(erro({ raiz: "4990" }), /suite OU raiz/); // os dois juntos
    assert.match(erro({ suite: undefined, raiz: "49a" }), /raiz inválida/);
    assert.match(erro({ agora: "2026-11-07T12:00:00" }), /agora inválido/);
    assert.match(erro({ agora: "ontem" }), /agora inválido/);
    assert.match(erro({ agora: "2026-11-07T12:06:00-03:00" }), /tolerância/);
    assert.match(erro({ janela_min: "241" }), /janela_min/);
    assert.match(erro({ janela_min: "-1" }), /janela_min/);
  });

  test("B: desde (com fuso) vira hora local; apos_ref e limite (1–1000, padrão 500); recusas", () => {
    const ler = (q) => est.lerConsultaCheckouts({ unidade: "lush_ipiranga", desde: "2026-11-07T10:00:00.000-03:00", ...q }, AGORA_MS);
    const ok = ler({});
    assert.deepEqual(
      { desde: ok.consulta.desdeLocal, apos: ok.consulta.aposRef, limite: ok.consulta.limite },
      { desde: "2026-11-07 10:00:00.000", apos: null, limite: 500 },
    );
    assert.equal(ler({ apos_ref: "6001", limite: "2" }).consulta.aposRef, "6001");
    assert.equal(ler({ desde: "2026-11-07T13:00:00.456Z" }).consulta.desdeLocal, "2026-11-07 10:00:00.456");
    assert.match(ler({ unidade: "x" }).erro, /unidade/);
    assert.match(ler({ desde: "2026-11-07 10:00" }).erro, /desde inválido/);
    assert.match(ler({ desde: "2026-10-01T00:00:00-03:00" }).erro, /31 dias/);
    assert.match(ler({ desde: "2026-11-07T12:10:00-03:00" }).erro, /futuro/);
    assert.match(ler({ apos_ref: "x1" }).erro, /apos_ref/);
    assert.match(ler({ limite: "0" }).erro, /limite/);
    assert.match(ler({ limite: "1001" }).erro, /limite/);
  });

  test("C: locação numérica; janela de 72h pelo relógio DESTE servidor (hora local do Automo)", () => {
    const ok = est.lerConsultaContato({ unidade: "lush_ipiranga", locacao: "8001" }, AGORA_MS);
    assert.equal(ok.consulta.limiteLocal, "2026-11-04 12:00:00.000");
    assert.match(est.lerConsultaContato({ unidade: "lush_ipiranga", locacao: "80a" }, AGORA_MS).erro, /locacao/);
    assert.match(est.lerConsultaContato({ unidade: "lush_ipiranga" }, AGORA_MS).erro, /locacao/);
    assert.match(est.lerConsultaContato({ unidade: "?", locacao: "1" }, AGORA_MS).erro, /unidade/);
  });

  test("celular brasileiro → E.164; fixo, curto ou lixo → null (o mesmo padrão do SQL do B)", () => {
    const casos = [
      ["(11) 90000-0001", "+5511900000001"],
      ["(11) 9000-00001", "+5511900000001"], // máscara errada, mesmos dígitos
      ["(11)90000-0001", "+5511900000001"],
      ["+5511900000001", "+5511900000001"],
      ["+55 11 90000-0001", "+5511900000001"],
      ["011900000001", "+5511900000001"],
      ["11900000001", "+5511900000001"],
      ["(11) 3000-0000", null], // fixo
      ["(11) 80000-0001", null], // não começa com 9
      ["(01) 90000-0001", null], // DDD inválido
      ["90000-0001", null],
      ["", null],
      [null, null],
      [12345678901, null],
    ];
    for (const [bruto, esperado] of casos) {
      assert.equal(est.celularE164(bruto), esperado, String(bruto));
      // tem_contato (SQL) usa o MESMO padrão sobre os dígitos
      const digitos = typeof bruto === "string" ? bruto.replace(/\D/g, "") : "";
      assert.equal(new RegExp(est.CELULAR_BR_DIGITOS).test(digitos), esperado !== null, `padrão: ${bruto}`);
    }
  });

  test("horas do Automo (sem fuso) saem em ISO 8601 com o deslocamento de São Paulo", () => {
    assert.equal(est.deLocalAutomo("2026-11-07T10:00:00.000"), "2026-11-07T10:00:00-03:00");
    assert.equal(est.deLocalAutomo("2026-11-07T10:00:00.456", true), "2026-11-07T10:00:00.456-03:00");
    assert.equal(est.deLocalAutomo(null), null);
  });
});

describe("regras (NpsService, pool falso)", () => {
  test("A, suíte ATIVA → raiz da cadeia (troca de suíte), início e tem_reserva", async () => {
    const pool = poolFalso();
    const r = await new svc.NpsService(pool).estadia(consulta(101));
    assert.deepEqual(r, {
      unidade: "lush_ipiranga",
      suite: 101,
      estado: "ativa",
      locacao_raiz_ref: "4990",
      locacao_ref: "5001",
      inicio: "2026-11-07T09:30:00-03:00",
      fim: null,
      tem_reserva: true,
    });
    assert.ok(!pool.chamadas.some((c) => c.sql === svc.SQL_ULTIMA_FINALIZADA));
    assert.ok(!pool.chamadas.some((c) => c.sql === svc.SQL_SUITE_ATUAL_DA_CADEIA));
  });

  test("A, finalizada DENTRO da janela → finalizada_recente; FORA → nenhuma", async () => {
    const dentro = await new svc.NpsService(poolFalso()).estadia(consulta(102, 120));
    assert.equal(dentro.estado, "finalizada_recente");
    assert.equal(dentro.locacao_raiz_ref, "5002");
    assert.equal(dentro.fim, "2026-11-07T10:00:00-03:00");
    const fora = await new svc.NpsService(poolFalso()).estadia(consulta(102, 60));
    assert.deepEqual(fora, {
      unidade: "lush_ipiranga",
      suite: 102,
      estado: "nenhuma",
      locacao_raiz_ref: null,
      locacao_ref: null,
      inicio: null,
      fim: null,
      tem_reserva: false,
    });
  });

  test("A, suíte sem locação → nenhuma; suíte inexistente → null", async () => {
    assert.equal((await new svc.NpsService(poolFalso()).estadia(consulta(103))).estado, "nenhuma");
    assert.equal(await new svc.NpsService(poolFalso()).estadia(consulta(999)), null);
  });

  test("A por RAIZ → responde pela suíte ATUAL da cadeia (troca de suíte); raiz desconhecida → null", async () => {
    const pool = poolFalso();
    const r = await new svc.NpsService(pool).estadia(consultaRaiz("4990"));
    assert.equal(r.suite, 101);
    assert.equal(r.estado, "ativa");
    assert.equal(r.locacao_raiz_ref, "4990");
    assert.deepEqual(pool.chamadas[0].params, ["4990"]);
    assert.equal((await new svc.NpsService(poolFalso()).estadia(consultaRaiz("5002"))).estado, "finalizada_recente");
    assert.equal(await new svc.NpsService(poolFalso()).estadia(consultaRaiz("123")), null);
    // a cadeia termina num apartamento que não é suíte da unidade → null
    assert.equal(await new svc.NpsService(poolFalso()).estadia(consultaRaiz("7000")), null);
  });

  test("B: itens com raiz, suíte final, horas com ms, origem (BALCAO sem reserva), id no canal e tem_contato; paginação", async () => {
    const ler = (q) => est.lerConsultaCheckouts({ unidade: "lush_ipiranga", desde: "2026-11-07T09:00:00-03:00", ...q }, AGORA_MS).consulta;
    const pool = poolFalso();
    const p1 = await new svc.NpsService(pool).checkouts(ler({ limite: "2" }));
    assert.deepEqual(pool.chamadas[0].params.slice(0, 3), ["2026-11-07 09:00:00.000", -1, 2]);
    assert.deepEqual(p1.itens[0], {
      locacao_raiz_ref: "6000",
      locacao_ref: "6001",
      unidade: "lush_ipiranga",
      suite: 101,
      inicio: "2026-11-07T08:00:00.000-03:00",
      fim: "2026-11-07T10:00:00.000-03:00",
      fim_tipo: "FINALIZADA",
      origem_reserva: "RESERVA_API",
      reserva_canal_ref: "0f5e2a9c-0000-4000-8000-000000000001",
      tem_contato: true,
    });
    assert.equal(p1.itens[1].origem_reserva, "BALCAO");
    assert.equal(p1.itens[1].locacao_raiz_ref, "6002"); // sem cadeia, a raiz é ela mesma
    assert.equal(p1.itens[1].reserva_canal_ref, null);
    assert.deepEqual(p1.proximo, { desde: "2026-11-07T10:00:00.000-03:00", apos_ref: "6002" });
    for (const i of p1.itens) assert.deepEqual(Object.keys(i).filter((k) => /cel|tel|fone|nome|mail|cpf/i.test(k)), []);

    const p2 = await new svc.NpsService(poolFalso()).checkouts(ler({ desde: p1.proximo.desde, apos_ref: p1.proximo.apos_ref, limite: "2" }));
    assert.deepEqual(p2.itens.map((i) => i.locacao_ref), ["6003"]);
    assert.equal(p2.itens[0].fim, "2026-11-07T11:15:30.456-03:00");
    assert.equal(p2.proximo, null);
  });

  test("C: entregue em E.164 só para FINALIZADA na janela com celular; senão o motivo", async () => {
    const c = (loc) => new svc.NpsService(poolFalso()).contato(est.lerConsultaContato({ unidade: "lush_ipiranga", locacao: loc }, AGORA_MS).consulta);
    assert.deepEqual(await c("8001"), { ok: true, celular: E164_FICTICIO, origem_reserva: "RESERVA_API" });
    assert.deepEqual(await c("8006"), { ok: true, celular: "+5511900000002", origem_reserva: "GUIA_DE_MOTEIS" });
    assert.deepEqual(await c("8002"), { ok: false, motivo: "sem_contato" }); // só fixo
    assert.deepEqual(await c("8003"), { ok: false, motivo: "sem_contato" }); // balcão
    assert.deepEqual(await c("8004"), { ok: false, motivo: "fora_da_janela" });
    assert.deepEqual(await c("8005"), { ok: false, motivo: "nao_encontrada" }); // TRANSFERIDA
    assert.deepEqual(await c("9999"), { ok: false, motivo: "nao_encontrada" });
  });

  test("nenhuma query usa o relógio do banco (réplica ~9 min adiantada) e todas são parametrizadas", () => {
    const todas = [svc.SQL_SUITE, svc.SQL_SUITE_ATUAL_DA_CADEIA, svc.SQL_ATIVA, svc.SQL_ULTIMA_FINALIZADA, svc.SQL_CADEIA, svc.SQL_CHECKOUTS, svc.SQL_CONTATO];
    for (const sql of todas) {
      assert.doesNotMatch(sql, /now\(|current_(timestamp|date|time)|localtime|clock_timestamp|statement_timestamp/i);
      assert.match(sql, /\$1/);
    }
    assert.match(svc.SQL_ULTIMA_FINALIZADA, /\$2::timestamp/);
    assert.match(svc.SQL_CHECKOUTS, /fimocupacaotipo = 'FINALIZADA'/);
    assert.match(svc.SQL_CHECKOUTS, /~ \$5/); // tem_contato com o padrão passado como parâmetro
    // B não devolve telefone: cada campo de telefone só aparece dentro do
    // regexp_replace(coalesce(...)) que vira o booleano tem_contato
    const usos = svc.SQL_CHECKOUTS.match(/pe\.(celular|telefone[12])/g) ?? [];
    const noBooleano = svc.SQL_CHECKOUTS.match(/regexp_replace\(coalesce\(pe\.(celular|telefone[12])/g) ?? [];
    assert.equal(usos.length, 3);
    assert.equal(noBooleano.length, usos.length);
    // C: o caminho é reserva.id_cliente → pessoapapel → pessoa, e só lê o telefone se liberada
    assert.match(svc.SQL_CONTATO, /pp\.id = r\.id_cliente/);
    assert.match(svc.SQL_CONTATO, /pe\.id = pp\.id_pessoa/);
    assert.match(svc.SQL_CONTATO, /CASE WHEN alvo\.liberada THEN pe\.telefone1 END/);
  });
});

describe("HTTP de ponta a ponta (/nps/v1/*)", () => {
  let app;
  let base;
  const pool = poolFalso();
  const logs = [];
  const antes = process.env.NPS_HMAC_KEYS;

  before(async () => {
    class TesteNpsModule {}
    Module({
      controllers: [NpsController],
      providers: [svc.NpsService, NpsHmacGuard, { provide: TenantPoolService, useValue: pool }],
    })(TesteNpsModule);
    const guardar = (...a) => logs.push(a.map(String).join(" "));
    app = await NestFactory.create(TesteNpsModule, {
      logger: { log: guardar, warn: guardar, error: guardar, debug: () => {}, verbose: () => {} },
    });
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  });
  after(async () => {
    await app?.close();
    if (antes === undefined) delete process.env.NPS_HMAC_KEYS;
    else process.env.NPS_HMAC_KEYS = antes;
  });

  const agoraIso = () => new Date().toISOString();
  const caminho = (suite, extra = "") =>
    `/nps/v1/estadia?unidade=lush_ipiranga&suite=${suite}&agora=${encodeURIComponent(agoraIso())}${extra}`;
  const chamar = (cam, { id = "k1", seg = S1, assinado = cam, ts = Math.floor(Date.now() / 1000) } = {}) =>
    fetch(base + cam, {
      headers: {
        "X-LHG-Key-Id": id,
        "X-LHG-Timestamp": String(ts),
        "X-LHG-Signature": hmac.assinarNps(seg, "GET", assinado, String(ts)),
      },
    });
  const comoChat = (cam) => chamar(cam, { id: "chat", seg: SC });

  test("sem NPS_HMAC_KEYS: módulo DESLIGADO (404), mesmo com assinatura", async () => {
    delete process.env.NPS_HMAC_KEYS;
    assert.equal((await chamar(caminho(101))).status, 404);
  });

  test("A assinado → 200; sem cabeçalhos / outra chave / adulterado / atrasado / caminho do proxy → 401", async () => {
    process.env.NPS_HMAC_KEYS = `k1:${S1},k2:${S2},chat:${SC}:contato`;
    const cam = caminho(101);
    const ok = await chamar(cam);
    assert.equal(ok.status, 200);
    const j = await ok.json();
    assert.equal(j.estado, "ativa");
    assert.equal(j.locacao_raiz_ref, "4990");
    assert.equal((await chamar(caminho(101), { id: "k2", seg: S2 })).status, 200);
    assert.equal((await fetch(base + cam)).status, 401);
    assert.equal((await chamar(cam, { seg: S2 })).status, 401);
    assert.equal((await chamar(cam.replace("suite=101", "suite=102"), { assinado: cam })).status, 401);
    assert.equal((await chamar(cam, { ts: Math.floor(Date.now() / 1000) - 400 })).status, 401);
    assert.equal((await chamar(cam, { assinado: "/lhg" + cam })).status, 401);
    assert.equal((await (await fetch(base + cam)).json()).message, "Não autorizado");
  });

  test("A: 400 inválida; 404 suíte/raiz desconhecida; janela_min; por raiz → suíte atual", async () => {
    assert.equal((await chamar("/nps/v1/estadia?unidade=nao_existe&suite=101&agora=" + encodeURIComponent(agoraIso()))).status, 400);
    assert.equal((await chamar("/nps/v1/estadia?unidade=lush_ipiranga&suite=101&agora=2026-01-01T00:00:00Z")).status, 400);
    assert.equal((await chamar(caminho(999))).status, 404);
    assert.equal((await (await chamar(caminho(103, "&janela_min=60"))).json()).estado, "nenhuma");
    const porRaiz = await chamar(`/nps/v1/estadia?unidade=lush_ipiranga&raiz=4990&agora=${encodeURIComponent(agoraIso())}`);
    assert.equal(porRaiz.status, 200);
    assert.equal((await porRaiz.json()).suite, 101);
    const semRaiz = await chamar(`/nps/v1/estadia?unidade=lush_ipiranga&raiz=123&agora=${encodeURIComponent(agoraIso())}`);
    assert.equal(semRaiz.status, 404);
    assert.equal((await semRaiz.json()).message, "raiz desconhecida");
  });

  test("B (chave do NPS) → 200 com itens e proximo; desde inválido → 400", async () => {
    const desde = encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString());
    const r = await chamar(`/nps/v1/checkouts?unidade=lush_ipiranga&desde=${desde}&limite=2`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.unidade, "lush_ipiranga");
    assert.ok(Array.isArray(j.itens));
    assert.equal((await chamar(`/nps/v1/checkouts?unidade=lush_ipiranga&desde=ontem`)).status, 400);
  });

  test("ESCOPO: a chave do NPS recebe 403 no C; a do Chat LHG recebe 403 no A e no B", async () => {
    const contato = "/nps/v1/contato?unidade=lush_ipiranga&locacao=8001";
    const r = await chamar(contato);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).message, "Proibido");
    assert.equal((await comoChat(caminho(101))).status, 403);
    const desde = encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString());
    assert.equal((await comoChat(`/nps/v1/checkouts?unidade=lush_ipiranga&desde=${desde}`)).status, 403);
  });

  test("C (chave do Chat LHG) → 200 só com celular E.164 e origem, Cache-Control no-store; 404 com o motivo", async () => {
    const ok = await comoChat("/nps/v1/contato?unidade=lush_ipiranga&locacao=8001");
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ok.json(), { celular: E164_FICTICIO, origem_reserva: "RESERVA_API" });
    for (const [loc, motivo] of [["8002", "sem_contato"], ["8004", "fora_da_janela"], ["8005", "nao_encontrada"], ["9999", "nao_encontrada"]]) {
      const r = await comoChat(`/nps/v1/contato?unidade=lush_ipiranga&locacao=${loc}`);
      assert.equal(r.status, 404, loc);
      assert.equal((await r.json()).motivo, motivo, loc);
    }
    assert.equal((await comoChat("/nps/v1/contato?unidade=lush_ipiranga&locacao=abc")).status, 400);
  });

  test("auditoria: chave, unidade e resultado no log; nenhum segredo, assinatura ou TELEFONE", () => {
    const tudo = logs.join("\n");
    assert.match(tudo, /nps\.estadia key=k1 unidade=lush_ipiranga suite=101 estado=ativa/);
    assert.match(tudo, /nps\.estadia key=k1 unidade=lush_ipiranga raiz=4990 estado=ativa/);
    assert.match(tudo, /nps\.checkouts key=k1 unidade=lush_ipiranga itens=\d+/);
    assert.match(tudo, /nps\.contato key=chat unidade=lush_ipiranga locacao=8001 resultado=entregue/);
    assert.match(tudo, /nps\.contato key=chat unidade=lush_ipiranga locacao=8004 resultado=fora_da_janela/);
    assert.match(tudo, /nps\.recusado motivo=escopo key=k1 rota=contato/);
    assert.match(tudo, /nps\.recusado motivo=assinatura key=k1/);
    for (const s of [S1, S2, SC]) assert.ok(!tudo.includes(s));
    assert.doesNotMatch(tudo, /[0-9a-f]{64}/);
    assert.ok(!tudo.includes(E164_FICTICIO) && !tudo.includes("900000001") && !tudo.includes("90000-0001"));
  });
});
