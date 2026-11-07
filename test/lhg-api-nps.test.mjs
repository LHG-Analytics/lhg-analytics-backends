// API servidor-a-servidor do NPS no lhg-api (Endpoint A: GET /nps/v1/estadia).
// HMAC, validação da consulta, regras da estadia (com um pool FALSO, sem banco)
// e o HTTP de ponta a ponta. Segredos de TESTE gerados aqui, na hora.
// Rodar depois do build: node --test test/
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../lhg-api/package.json", import.meta.url));
require("reflect-metadata");
const { NestFactory } = require("@nestjs/core");
const { Module, Logger } = require("@nestjs/common");
const hmac = require("../lhg-api/dist/nps/nps-hmac.js");
const est = require("../lhg-api/dist/nps/nps-estadia.js");
const svc = require("../lhg-api/dist/nps/nps.service.js");
const { NpsController } = require("../lhg-api/dist/nps/nps.controller.js");
const { NpsHmacGuard } = require("../lhg-api/dist/nps/nps-hmac.guard.js");
const { TenantPoolService } = require("../lhg-api/dist/database/tenant-pool.service.js");

const segredo = () => crypto.randomBytes(32).toString("hex");
const S1 = segredo();
const S2 = segredo();

// ── Pool falso: suítes 101 (ativa), 102 (finalizada 10:00), 103 (nunca usada) ─
function poolFalso() {
  const chamadas = [];
  const suites = { 101: 11, 102: 12, 103: 13 };
  const ativas = { 11: { ref: "5001", inicio: "2026-11-07T09:30:00.000" } };
  const ultimas = {
    12: { ref: "5002", inicio: "2026-11-07T08:00:00.000", fim: "2026-11-07T10:00:00.000" },
  };
  const cadeias = { 5001: { raiz: "4990", tem_reserva: true }, 5002: { raiz: "5002", tem_reserva: false } };
  return {
    chamadas,
    async queryWithParams(slug, sql, params) {
      chamadas.push({ slug, sql, params });
      if (sql === svc.SQL_SUITE) {
        const id = suites[params[0]];
        assert.ok(Array.isArray(params[1]) && params[1].length > 0, "categorias da unidade");
        return id ? [{ id }] : [];
      }
      if (sql === svc.SQL_ATIVA) return ativas[params[0]] ? [ativas[params[0]]] : [];
      if (sql === svc.SQL_ULTIMA_FINALIZADA) {
        const u = ultimas[params[0]];
        // o banco compara datafinaldaocupacao >= $2 (texto local, sem fuso)
        return u ? [{ ...u, na_janela: u.fim.replace("T", " ") >= params[1] }] : [];
      }
      if (sql === svc.SQL_CADEIA) return [cadeias[params[0]]];
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

describe("HMAC (nps-hmac)", () => {
  test("NPS_HMAC_KEYS: duas chaves válidas; id inválido, segredo curto e id repetido são ignorados", () => {
    const { chaves, invalidas } = hmac.lerChavesNps(` k1:${S1} , k2:${S2},x y:${S1},k3:curto,k1:${S2},:${S1}`);
    assert.deepEqual([...chaves.keys()], ["k1", "k2"]);
    assert.equal(invalidas, 4);
    assert.equal(hmac.lerChavesNps(undefined).chaves.size, 0);
  });

  const chaves = new Map([["k1", S1], ["k2", S2]]);
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

  test("assinatura correta → ok (e a 2ª chave também vale: rotação sem parada)", () => {
    assert.deepEqual(hmac.verificarNps(base()), { ok: true, keyId: "k1" });
    assert.deepEqual(
      hmac.verificarNps(base({ keyId: "k2", assinatura: hmac.assinarNps(S2, "GET", CAM, ts) })),
      { ok: true, keyId: "k2" },
    );
    // hex em maiúsculas também
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
    // segredo de outra chave, query adulterada, outro método, corpo diferente
    assert.equal(motivo({ assinatura: hmac.assinarNps(S2, "GET", CAM, ts) }), "assinatura");
    assert.equal(motivo({ caminho: CAM.replace("101", "102") }), "assinatura");
    assert.equal(motivo({ metodo: "POST" }), "assinatura");
    assert.equal(motivo({ corpo: "{}" }), "assinatura");
  });
});

describe("consulta do Endpoint A (nps-estadia)", () => {
  test("válida: janela padrão 120 min, limite na hora LOCAL do Automo (sem fuso)", () => {
    const c = consulta(101);
    assert.equal(c.tenant.slug, "lush_ipiranga");
    assert.equal(c.suite, 101);
    assert.equal(c.janelaMin, 120);
    assert.equal(c.limiteLocal, "2026-11-07 10:00:00.000");
    assert.equal(consulta(101, 0).limiteLocal, "2026-11-07 12:00:00.000");
    // agora em UTC dá o mesmo limite local
    const r = est.lerConsultaEstadia({ unidade: "lush_ipiranga", suite: "101", agora: "2026-11-07T15:00:00Z", janela_min: "60" }, AGORA_MS);
    assert.equal(r.consulta.limiteLocal, "2026-11-07 11:00:00.000");
  });

  test("inválidas → erro (sem consulta ao banco)", () => {
    const erro = (q) => est.lerConsultaEstadia({ unidade: "lush_ipiranga", suite: "101", agora: AGORA, ...q }, AGORA_MS).erro;
    assert.match(erro({ unidade: "lush-ipiranga" }), /unidade/);
    assert.match(erro({ unidade: undefined }), /unidade/);
    assert.match(erro({ suite: "10a" }), /suite/);
    assert.match(erro({ suite: ["101"] }), /suite/);
    assert.match(erro({ agora: "2026-11-07T12:00:00" }), /agora inválido/); // sem fuso
    assert.match(erro({ agora: "ontem" }), /agora inválido/);
    assert.match(erro({ agora: "2026-11-07T12:06:00-03:00" }), /tolerância/);
    assert.match(erro({ janela_min: "241" }), /janela_min/);
    assert.match(erro({ janela_min: "-1" }), /janela_min/);
  });

  test("horas do Automo (sem fuso) saem em ISO 8601 com o deslocamento de São Paulo", () => {
    assert.equal(est.deLocalAutomo("2026-11-07T10:00:00.000"), "2026-11-07T10:00:00-03:00");
    assert.equal(est.deLocalAutomo(null), null);
  });
});

describe("regras da estadia (NpsService, pool falso)", () => {
  test("suíte ATIVA → raiz da cadeia (troca de suíte), início e tem_reserva", async () => {
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
    // ativa não consulta a última finalizada
    assert.ok(!pool.chamadas.some((c) => c.sql === svc.SQL_ULTIMA_FINALIZADA));
  });

  test("finalizada DENTRO da janela → finalizada_recente; FORA → nenhuma", async () => {
    const dentro = await new svc.NpsService(poolFalso()).estadia(consulta(102, 120)); // limite 10:00
    assert.equal(dentro.estado, "finalizada_recente");
    assert.equal(dentro.locacao_raiz_ref, "5002");
    assert.equal(dentro.fim, "2026-11-07T10:00:00-03:00");
    assert.equal(dentro.tem_reserva, false);
    const fora = await new svc.NpsService(poolFalso()).estadia(consulta(102, 60)); // limite 11:00
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

  test("suíte sem nenhuma locação → nenhuma; suíte inexistente → null", async () => {
    assert.equal((await new svc.NpsService(poolFalso()).estadia(consulta(103))).estado, "nenhuma");
    assert.equal(await new svc.NpsService(poolFalso()).estadia(consulta(999)), null);
  });

  test("nenhuma query usa o relógio do banco (réplica ~9 min adiantada) e todas são parametrizadas", () => {
    for (const sql of [svc.SQL_SUITE, svc.SQL_ATIVA, svc.SQL_ULTIMA_FINALIZADA, svc.SQL_CADEIA]) {
      assert.doesNotMatch(sql, /now\(|current_(timestamp|date|time)|localtime|clock_timestamp|statement_timestamp/i);
      assert.match(sql, /\$1/);
    }
    assert.match(svc.SQL_ULTIMA_FINALIZADA, /\$2::timestamp/);
  });
});

describe("HTTP de ponta a ponta (GET /nps/v1/estadia)", () => {
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

  test("sem NPS_HMAC_KEYS: módulo DESLIGADO (404), mesmo com assinatura", async () => {
    delete process.env.NPS_HMAC_KEYS;
    assert.equal((await chamar(caminho(101))).status, 404);
  });

  test("assinado → 200 com a estadia; sem cabeçalhos / outra chave / adulterado / atrasado / caminho do proxy → 401", async () => {
    process.env.NPS_HMAC_KEYS = `k1:${S1},k2:${S2}`;
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
    const corpo = await (await fetch(base + cam)).json();
    assert.equal(corpo.message, "Não autorizado");
  });

  test("consulta inválida → 400; suíte inexistente → 404; janela_min respeitada", async () => {
    process.env.NPS_HMAC_KEYS = `k1:${S1}`;
    assert.equal((await chamar("/nps/v1/estadia?unidade=nao_existe&suite=101&agora=" + encodeURIComponent(agoraIso()))).status, 400);
    assert.equal((await chamar("/nps/v1/estadia?unidade=lush_ipiranga&suite=101&agora=2026-01-01T00:00:00Z")).status, 400);
    assert.equal((await chamar(caminho(999))).status, 404);
    const r = await chamar(caminho(103, "&janela_min=60"));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).estado, "nenhuma");
  });

  test("auditoria: chave, unidade, suíte e estado no log; nenhum segredo nem assinatura", () => {
    const tudo = logs.join("\n");
    assert.match(tudo, /nps\.estadia key=k1 unidade=lush_ipiranga suite=101 estado=ativa/);
    assert.match(tudo, /nps\.recusado motivo=assinatura key=k1/);
    for (const s of [S1, S2]) assert.ok(!tudo.includes(s));
    assert.doesNotMatch(tudo, /[0-9a-f]{64}/);
  });
});
