// API servidor-a-servidor do NPS no lhg-api:
//   A: GET /nps/v1/estadia (suite ou raiz)   B: GET /nps/v1/checkouts
//   C: GET /nps/v1/contato (só a chave de escopo 'contato', a do Chat LHG)
//   D: POST /nps/v1/confirmar-cpf (3 primeiros dígitos, conferidos no banco)
//   E: GET /nps/v1/suites   F: GET /nps/v1/hospede (escopo 'nps_pessoal', com ator)
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
const tent = require("../lhg-api/dist/nps/nps-tentativas.service.js");

/** Serviço com as tentativas do Endpoint D em memória (sem Redis). */
const servico = (pool, t = new tent.NpsTentativasService()) => new svc.NpsService(pool, t);

const segredo = () => crypto.randomBytes(32).toString("hex");
const S1 = segredo();
const S2 = segredo();
const SC = segredo(); // chave do Chat LHG (escopo contato)
const SP = segredo(); // chave do painel interno (escopo nps_pessoal)
// Nomes FICTÍCIOS.
const NOME_A = "Pessoa Ficticia Alfa";
const NOME_B = "Pessoa Ficticia Beta";
// Telefone FICTÍCIO (faixa de teste), no formato em que o Automo grava.
const TEL_FICTICIO = "(11) 90000-0001";
const E164_FICTICIO = "+5511900000001";

// ── Pool falso ──────────────────────────────────────────────────────────────
// Suítes 101 (ativa, cadeia 4990→5001), 102 (finalizada 10:00), 103 (vazia),
// 201 (suíte ATUAL da cadeia 4990 depois da troca... ver SQL_SUITE_ATUAL_DA_CADEIA).
function poolFalso() {
  const chamadas = [];
  const suites = { 101: 11, 102: 12, 103: 13, 104: 14, 201: 21 };
  const ativas = { 11: { ref: "5001", inicio: "2026-11-07T09:30:00.000" }, 14: { ref: "5003", inicio: "2026-11-07T11:00:00.000" } };
  const ultimas = {
    12: { ref: "5002", inicio: "2026-11-07T08:00:00.000", fim: "2026-11-07T10:00:00.000" },
  };
  const cadeias = { 5001: { raiz: "4990", tem_reserva: true }, 5002: { raiz: "5002", tem_reserva: false }, 5003: { raiz: "5003", tem_reserva: false } };
  const suiteAtual = { 4990: 101, 5001: 101, 5002: 102, 5003: 104, 7000: 555 };
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
  // Prefixos ACEITOS por raiz (o banco já tirou inválidos e genéricos). Fictícios.
  const cpfs = { 4990: ["123", "456"], 5002: [], 5003: [] };
  return {
    chamadas,
    async queryWithParams(slug, sql, params) {
      chamadas.push({ slug, sql, params });
      if (sql === svc.SQL_SUITES) {
        assert.ok(Array.isArray(params[0]) && params[0].length > 0);
        return [
          { suite: 101, categoria_id: 17, categoria_nome: "Lush Spa", categoria_sigla: "LS" },
          { suite: 102, categoria_id: 10, categoria_nome: "Lush Pop", categoria_sigla: null },
        ];
      }
      if (sql === svc.SQL_HOSPEDE) {
        const vazio = { nome: null, papel: null };
        if (params[0] === "4990") return [
          { existe: true, liberada: true, nome: NOME_A, papel: "reserva" },
          { existe: true, liberada: true, nome: NOME_B, papel: "acompanhante" },
        ];
        if (params[0] === "6000") return [{ existe: true, liberada: true, nome: NOME_A, papel: "hospede" }];
        if (params[0] === "5002") return [{ existe: true, liberada: false, ...vazio }];
        return [{ existe: false, liberada: false, ...vazio }];
      }
      if (sql === svc.SQL_TEM_CPF) return [{ tem_cpf: (cpfs[params[0]] ?? []).length > 0 }];
      if (sql === svc.SQL_CONFIRMAR_CPF) {
        const p = cpfs[params[0]] ?? [];
        return [{ tem_cpf: p.length > 0, confere: p.includes(params[2]) }];
      }
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
    assert.deepEqual(hmac.verificarNps(base()), { ok: true, keyId: "k1", escopo: "nps", ator: null });
    assert.equal(hmac.verificarNps(base({ keyId: "k2", assinatura: hmac.assinarNps(S2, "GET", CAM, ts) })).ok, true);
    assert.deepEqual(hmac.verificarNps(base({ keyId: "chat", assinatura: hmac.assinarNps(SC, "GET", CAM, ts) })), {
      ok: true,
      keyId: "chat",
      escopo: "contato",
      ator: null,
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

describe("HMAC com corpo (POST)", () => {
  const chaves = new Map([["k1", { segredo: S1, escopo: "nps" }]]);
  const ts = String(Math.floor(AGORA_MS / 1000));
  const CAM = "/nps/v1/confirmar-cpf";
  const corpo = Buffer.from(JSON.stringify({ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "123" }));
  const v = (o) => hmac.verificarNps({ chaves, keyId: "k1", timestamp: ts, metodo: "POST", caminho: CAM, agoraMs: AGORA_MS, ...o });

  test("assinatura sobre os BYTES do corpo: Buffer e o mesmo texto dão a mesma assinatura", () => {
    const a = hmac.assinarNps(S1, "POST", CAM, ts, corpo);
    assert.equal(a, hmac.assinarNps(S1, "POST", CAM, ts, corpo.toString("utf8")));
    assert.equal(v({ assinatura: a, corpo }).ok, true);
  });

  test("corpo adulterado (outro prefixo, espaço a mais) ou ausente → assinatura", () => {
    const a = hmac.assinarNps(S1, "POST", CAM, ts, corpo);
    assert.equal(v({ assinatura: a, corpo: Buffer.from(corpo.toString().replace("123", "124")) }).motivo, "assinatura");
    assert.equal(v({ assinatura: a, corpo: Buffer.concat([corpo, Buffer.from(" ")]) }).motivo, "assinatura");
    assert.equal(v({ assinatura: a, corpo: "" }).motivo, "assinatura");
  });
});

describe("HMAC com X-LHG-Ator (assinado)", () => {
  const chaves = new Map([["p", { segredo: SP, escopo: "nps_pessoal" }]]);
  const ts = String(Math.floor(AGORA_MS / 1000));
  const CAM = "/nps/v1/hospede?unidade=lush_ipiranga&raiz=4990";
  const v = (o) => hmac.verificarNps({ chaves, keyId: "p", timestamp: ts, metodo: "GET", caminho: CAM, agoraMs: AGORA_MS, ...o });

  test("texto canônico: o ator é a 5ª linha; sem ator, continua com 4 (compatível)", () => {
    const vazio = crypto.createHash("sha256").update("").digest("hex");
    assert.equal(hmac.textoCanonico("GET", CAM, ts, "", "u-42"), `GET\n${CAM}\n${ts}\n${vazio}\nu-42`);
    assert.equal(hmac.textoCanonico("GET", CAM, ts), `GET\n${CAM}\n${ts}\n${vazio}`);
  });

  test("ator assinado → ok com o ator; trocado, retirado ou acrescentado → assinatura", () => {
    const comAtor = hmac.assinarNps(SP, "GET", CAM, ts, "", "u-42");
    assert.deepEqual(v({ assinatura: comAtor, ator: "u-42" }), { ok: true, keyId: "p", escopo: "nps_pessoal", ator: "u-42" });
    assert.equal(v({ assinatura: comAtor, ator: "u-43" }).motivo, "assinatura");
    assert.equal(v({ assinatura: comAtor }).motivo, "assinatura");
    const semAtor = hmac.assinarNps(SP, "GET", CAM, ts);
    assert.equal(v({ assinatura: semAtor }).ator, null);
    assert.equal(v({ assinatura: semAtor, ator: "u-42" }).motivo, "assinatura");
  });

  test("ator fora do formato (e-mail, espaço, vazio, longo demais) → cabecalhos", () => {
    const a = hmac.assinarNps(SP, "GET", CAM, ts);
    for (const ruim of ["fulano@exemplo.invalid", "Fulano Tal", "", "x".repeat(65), ["u-1"]]) {
      assert.equal(v({ assinatura: a, ator: ruim }).motivo, "cabecalhos", String(ruim));
    }
  });

  test("escopo nps_pessoal é lido de NPS_HMAC_KEYS", () => {
    const { chaves: c, invalidas } = hmac.lerChavesNps(`k1:${S1},painel:${SP}:nps_pessoal`);
    assert.equal(invalidas, 0);
    assert.equal(c.get("painel").escopo, "nps_pessoal");
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

  test("D: corpo {unidade, raiz, prefixo3 (texto), janela_min?} → consulta pela raiz, com a hora DESTE servidor", () => {
    const ler = (b) => est.lerConsultaConfirmarCpf(b, AGORA_MS);
    const ok = ler({ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "012" });
    assert.ok(ok.ok, ok.erro);
    assert.equal(ok.consulta.prefixo, "012"); // zero à esquerda preservado
    assert.equal(ok.consulta.estadia.raiz, "4990");
    assert.equal(ok.consulta.estadia.suite, null);
    assert.equal(ok.consulta.estadia.janelaMin, 120);
    assert.equal(ok.consulta.estadia.limiteLocal, "2026-11-07 10:00:00.000");
    assert.equal(ok.consulta.estadia.limiteGenericoLocal, "2026-09-08 12:00:00.000");
    assert.equal(ler({ unidade: "lush_ipiranga", raiz: 4990, prefixo3: "012" }).consulta.estadia.raiz, "4990");
    assert.equal(ler({ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "012", janela_min: 60 }).consulta.estadia.janelaMin, 60);
    for (const [b, re] of [
      [{ unidade: "lush_ipiranga", raiz: "4990", prefixo3: 12 }, /prefixo3/], // número perde o zero à esquerda: recusado
      [{ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "12" }, /prefixo3/],
      [{ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "1234" }, /prefixo3/],
      [{ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "12a" }, /prefixo3/],
      [{ unidade: "lush_ipiranga", raiz: "49a", prefixo3: "123" }, /raiz/],
      [{ unidade: "lush_ipiranga", prefixo3: "123" }, /raiz/],
      [{ unidade: "x", raiz: "4990", prefixo3: "123" }, /unidade/],
      [{ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "123", janela_min: 999 }, /janela_min/],
      [null, /prefixo3/],
      [["4990"], /prefixo3/],
    ]) {
      assert.match(ler(b).erro, re);
    }
  });

  test("C: finalidade=retorno_avaliacao amplia a janela para 30 dias; outra finalidade → erro", () => {
    const ler = (q) => est.lerConsultaContato({ unidade: "lush_ipiranga", locacao: "8001", ...q }, AGORA_MS);
    assert.equal(ler({}).consulta.finalidade, null);
    assert.equal(ler({}).consulta.limiteLocal, "2026-11-04 12:00:00.000");
    assert.equal(ler({ finalidade: "retorno_avaliacao" }).consulta.finalidade, "retorno_avaliacao");
    assert.equal(ler({ finalidade: "retorno_avaliacao" }).consulta.limiteLocal, "2026-10-08 12:00:00.000");
    assert.match(ler({ finalidade: "marketing" }).erro, /finalidade/);
  });

  test("E e F: unidade; F com raiz numérica e janela de 180 dias", () => {
    assert.equal(est.lerConsultaSuites({ unidade: "lush_ipiranga" }).consulta.tenant.slug, "lush_ipiranga");
    assert.match(est.lerConsultaSuites({}).erro, /unidade/);
    const f = est.lerConsultaHospede({ unidade: "lush_ipiranga", raiz: "4990" }, AGORA_MS);
    assert.equal(f.consulta.raiz, "4990");
    assert.equal(f.consulta.limiteLocal, "2026-05-11 12:00:00.000");
    assert.match(est.lerConsultaHospede({ unidade: "lush_ipiranga", raiz: "x" }, AGORA_MS).erro, /raiz/);
    assert.match(est.lerConsultaHospede({ unidade: "?", raiz: "1" }, AGORA_MS).erro, /unidade/);
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

describe("tentativas do Endpoint D (NpsTentativasService)", () => {
  const delRedis = process.env.REDIS_URL;
  test("memória: 3 erros bloqueiam por 4h; acerto zera; o bloqueio vence", async () => {
    delete process.env.REDIS_URL;
    let agora = AGORA_MS;
    const t = new tent.NpsTentativasService();
    t.agora = () => agora;
    t.onModuleInit();
    assert.equal(tent.NPS_CPF_MAX_ERROS, 3);
    assert.equal(tent.NPS_CPF_BLOQUEIO_S, 14400);
    assert.deepEqual(await t.situacao("u:1"), { bloqueado: false, retryAfter: 0, restantes: 3 });
    assert.deepEqual(await t.registrarErro("u:1"), { bloqueado: false, retryAfter: 0, restantes: 2 });
    await t.limpar("u:1"); // acerto
    assert.equal((await t.situacao("u:1")).restantes, 3);
    await t.registrarErro("u:1");
    await t.registrarErro("u:1");
    assert.deepEqual(await t.registrarErro("u:1"), { bloqueado: true, retryAfter: 14400, restantes: 0 });
    assert.equal((await t.situacao("u:2")).bloqueado, false); // outra raiz não é afetada
    agora += 3600_000;
    assert.deepEqual(await t.situacao("u:1"), { bloqueado: true, retryAfter: 10800, restantes: 0 });
    agora += 3 * 3600_000 + 1000;
    assert.deepEqual(await t.situacao("u:1"), { bloqueado: false, retryAfter: 0, restantes: 3 });
  });

  test("memória: erros esparsos expiram depois de 4h (não acumulam para sempre)", async () => {
    let agora = AGORA_MS;
    const t = new tent.NpsTentativasService();
    t.agora = () => agora;
    await t.registrarErro("u:9");
    await t.registrarErro("u:9");
    agora += 4 * 3600_000 + 1;
    assert.deepEqual(await t.registrarErro("u:9"), { bloqueado: false, retryAfter: 0, restantes: 2 });
  });

  test("Redis (falso): INCR + EXPIRE no 1º erro, SET EX 4h no bloqueio, chaves com namespace e SEM prefixo/CPF", async () => {
    const dados = new Map();
    const ttls = new Map();
    const ops = [];
    const redis = {
      async incr(k) { ops.push(["incr", k]); const n = Number(dados.get(k) ?? 0) + 1; dados.set(k, String(n)); return n; },
      async expire(k, s) { ops.push(["expire", k, s]); ttls.set(k, s); return 1; },
      async set(k, v, ex, s) { ops.push(["set", k, v, ex, s]); dados.set(k, v); ttls.set(k, s); return "OK"; },
      async del(k) { ops.push(["del", k]); dados.delete(k); return 1; },
      async get(k) { return dados.get(k) ?? null; },
      async ttl(k) { return dados.has(k) ? ttls.get(k) ?? -1 : -2; },
    };
    const t = new tent.NpsTentativasService();
    t.client = redis;
    t.redisReady = true;
    assert.equal((await t.registrarErro("lush_ipiranga:4990")).restantes, 2);
    assert.equal((await t.registrarErro("lush_ipiranga:4990")).restantes, 1);
    assert.deepEqual(await t.registrarErro("lush_ipiranga:4990"), { bloqueado: true, retryAfter: 14400, restantes: 0 });
    assert.deepEqual(await t.situacao("lush_ipiranga:4990"), { bloqueado: true, retryAfter: 14400, restantes: 0 });
    assert.deepEqual(ops.filter((o) => o[0] === "expire").map((o) => o[2]), [14400]); // só no 1º erro
    const set = ops.find((o) => o[0] === "set");
    assert.deepEqual(set.slice(2), ["1", "EX", 14400]);
    for (const [, k] of ops) assert.match(k, /^[A-Za-z0-9_-]+:nps:cpf:(erros|bloq):lush_ipiranga:4990$/);
  });

  test("Redis caindo no meio → cai no Map, sem derrubar a conferência", async () => {
    const t = new tent.NpsTentativasService();
    t.client = { async incr() { throw new Error("ECONNRESET"); }, async ttl() { throw new Error("x"); }, async get() { throw new Error("x"); } };
    t.redisReady = true;
    assert.deepEqual(await t.registrarErro("u:3"), { bloqueado: false, retryAfter: 0, restantes: 2 });
    assert.equal((await t.situacao("u:3")).restantes, 2);
    if (delRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = delRedis;
  });
});

describe("regras (NpsService, pool falso)", () => {
  test("A, suíte ATIVA → raiz da cadeia (troca de suíte), início e tem_reserva", async () => {
    const pool = poolFalso();
    const r = await servico(pool).estadia(consulta(101));
    assert.deepEqual(r, {
      unidade: "lush_ipiranga",
      suite: 101,
      estado: "ativa",
      locacao_raiz_ref: "4990",
      locacao_ref: "5001",
      inicio: "2026-11-07T09:30:00-03:00",
      fim: null,
      tem_reserva: true,
      tem_cpf: true,
    });
    assert.ok(!pool.chamadas.some((c) => c.sql === svc.SQL_ULTIMA_FINALIZADA));
    // tem_cpf procura genéricos desde 60 dias antes do agora, na hora local
    assert.deepEqual(pool.chamadas.find((c) => c.sql === svc.SQL_TEM_CPF).params, ["4990", "2026-09-08 12:00:00.000"]);
    assert.ok(!pool.chamadas.some((c) => c.sql === svc.SQL_SUITE_ATUAL_DA_CADEIA));
  });

  test("A, finalizada DENTRO da janela → finalizada_recente; FORA → nenhuma", async () => {
    const dentro = await servico(poolFalso()).estadia(consulta(102, 120));
    assert.equal(dentro.estado, "finalizada_recente");
    assert.equal(dentro.locacao_raiz_ref, "5002");
    assert.equal(dentro.fim, "2026-11-07T10:00:00-03:00");
    assert.equal(dentro.tem_reserva, false);
    assert.equal(dentro.tem_cpf, false); // estadia sem CPF aceito → o NPS vai direto ao C4
    const fora = await servico(poolFalso()).estadia(consulta(102, 60));
    assert.deepEqual(fora, {
      unidade: "lush_ipiranga",
      suite: 102,
      estado: "nenhuma",
      locacao_raiz_ref: null,
      locacao_ref: null,
      inicio: null,
      fim: null,
      tem_reserva: false,
      tem_cpf: false,
    });
  });

  test("A, suíte sem locação → nenhuma; suíte inexistente → null", async () => {
    assert.equal((await servico(poolFalso()).estadia(consulta(103))).estado, "nenhuma");
    assert.equal(await servico(poolFalso()).estadia(consulta(999)), null);
  });

  test("A por RAIZ → responde pela suíte ATUAL da cadeia (troca de suíte); raiz desconhecida → null", async () => {
    const pool = poolFalso();
    const r = await servico(pool).estadia(consultaRaiz("4990"));
    assert.equal(r.suite, 101);
    assert.equal(r.estado, "ativa");
    assert.equal(r.locacao_raiz_ref, "4990");
    assert.deepEqual(pool.chamadas[0].params, ["4990"]);
    assert.equal((await servico(poolFalso()).estadia(consultaRaiz("5002"))).estado, "finalizada_recente");
    assert.equal(await servico(poolFalso()).estadia(consultaRaiz("123")), null);
    // a cadeia termina num apartamento que não é suíte da unidade → null
    assert.equal(await servico(poolFalso()).estadia(consultaRaiz("7000")), null);
  });

  test("B: itens com raiz, suíte final, horas com ms, origem (BALCAO sem reserva), id no canal e tem_contato; paginação", async () => {
    const ler = (q) => est.lerConsultaCheckouts({ unidade: "lush_ipiranga", desde: "2026-11-07T09:00:00-03:00", ...q }, AGORA_MS).consulta;
    const pool = poolFalso();
    const p1 = await servico(pool).checkouts(ler({ limite: "2" }));
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

    const p2 = await servico(poolFalso()).checkouts(ler({ desde: p1.proximo.desde, apos_ref: p1.proximo.apos_ref, limite: "2" }));
    assert.deepEqual(p2.itens.map((i) => i.locacao_ref), ["6003"]);
    assert.equal(p2.itens[0].fim, "2026-11-07T11:15:30.456-03:00");
    assert.equal(p2.proximo, null);
  });

  test("C: entregue em E.164 só para FINALIZADA na janela com celular; senão o motivo", async () => {
    const c = (loc) => servico(poolFalso()).contato(est.lerConsultaContato({ unidade: "lush_ipiranga", locacao: loc }, AGORA_MS).consulta);
    assert.deepEqual(await c("8001"), { ok: true, celular: E164_FICTICIO, origem_reserva: "RESERVA_API" });
    assert.deepEqual(await c("8006"), { ok: true, celular: "+5511900000002", origem_reserva: "GUIA_DE_MOTEIS" });
    assert.deepEqual(await c("8002"), { ok: false, motivo: "sem_contato" }); // só fixo
    assert.deepEqual(await c("8003"), { ok: false, motivo: "sem_contato" }); // balcão
    assert.deepEqual(await c("8004"), { ok: false, motivo: "fora_da_janela" });
    assert.deepEqual(await c("8005"), { ok: false, motivo: "nao_encontrada" }); // TRANSFERIDA
    assert.deepEqual(await c("9999"), { ok: false, motivo: "nao_encontrada" });
  });

  const D = (raiz, prefixo3) => {
    const r = est.lerConsultaConfirmarCpf({ unidade: "lush_ipiranga", raiz, prefixo3 }, AGORA_MS);
    assert.ok(r.ok, r.erro);
    return r.consulta;
  };

  test("D: confere qualquer CPF aceito da estadia; 3 erros bloqueiam a RAIZ; acerto zera os erros", async () => {
    const pool = poolFalso();
    const s = servico(pool);
    assert.deepEqual(await s.confirmarCpf(D("4990", "456")), { ok: true }); // o do acompanhante também vale
    const sql = pool.chamadas.find((c) => c.sql === svc.SQL_CONFIRMAR_CPF);
    assert.deepEqual(sql.params, ["4990", "2026-09-08 12:00:00.000", "456"]);
    assert.deepEqual(await s.confirmarCpf(D("4990", "999")), { ok: false, tentativas_restantes: 2 });
    assert.deepEqual(await s.confirmarCpf(D("4990", "123")), { ok: true }); // acerto zera
    assert.deepEqual(await s.confirmarCpf(D("4990", "999")), { ok: false, tentativas_restantes: 2 });
    assert.deepEqual(await s.confirmarCpf(D("4990", "998")), { ok: false, tentativas_restantes: 1 });
    assert.deepEqual(await s.confirmarCpf(D("4990", "997")), { ok: false, bloqueado: true, retry_after: 14400 });
    // bloqueada: nem o certo passa, e o banco nem é consultado
    const n = pool.chamadas.length;
    assert.deepEqual(await s.confirmarCpf(D("4990", "123")), { ok: false, bloqueado: true, retry_after: 14400 });
    assert.equal(pool.chamadas.length, n);
  });

  test("D: estadia sem CPF aceito → sem_cpf (não conta tentativa); raiz que não é a da suíte atual → sem_estadia", async () => {
    const s = servico(poolFalso());
    for (let i = 0; i < 5; i++) assert.deepEqual(await s.confirmarCpf(D("5003", "123")), { ok: false, sem_cpf: true });
    assert.deepEqual(await s.confirmarCpf(D("5001", "123")), { ok: false, sem_estadia: true }); // não é a raiz
    assert.deepEqual(await s.confirmarCpf(D("123", "123")), { ok: false, sem_estadia: true }); // raiz desconhecida
  });

  test("E: suítes com categoria; cache de 1h por unidade", async () => {
    const pool = poolFalso();
    const s = servico(pool);
    let agora = AGORA_MS;
    s.agora = () => agora;
    const r1 = await s.suites(est.lerConsultaSuites({ unidade: "lush_ipiranga" }).consulta.tenant);
    assert.equal(r1.cache, false);
    assert.deepEqual(r1.suites[0], { suite: 101, categoria_id: 17, categoria_nome: "Lush Spa", categoria_sigla: "LS" });
    assert.equal(r1.suites[1].categoria_sigla, null);
    agora += 59 * 60_000;
    assert.equal((await s.suites(r1.suites && est.lerConsultaSuites({ unidade: "lush_ipiranga" }).consulta.tenant)).cache, true);
    agora += 2 * 60_000;
    assert.equal((await s.suites(est.lerConsultaSuites({ unidade: "lush_ipiranga" }).consulta.tenant)).cache, false);
    assert.equal(pool.chamadas.filter((c) => c.sql === svc.SQL_SUITES).length, 2);
  });

  test("F: nomes com papel; fora da janela; raiz desconhecida", async () => {
    const F = (raiz) => servico(poolFalso()).hospede(est.lerConsultaHospede({ unidade: "lush_ipiranga", raiz }, AGORA_MS).consulta);
    assert.deepEqual(await F("4990"), { ok: true, pessoas: [{ nome: NOME_A, papel: "reserva" }, { nome: NOME_B, papel: "acompanhante" }] });
    assert.deepEqual(await F("6000"), { ok: true, pessoas: [{ nome: NOME_A, papel: "hospede" }] });
    assert.deepEqual(await F("5002"), { ok: false, motivo: "fora_da_janela" });
    assert.deepEqual(await F("123"), { ok: false, motivo: "nao_encontrada" });
  });

  test("C variante: a janela de 30 dias chega ao SQL como parâmetro", async () => {
    const pool = poolFalso();
    await servico(pool).contato(est.lerConsultaContato({ unidade: "lush_ipiranga", locacao: "8001", finalidade: "retorno_avaliacao" }, AGORA_MS).consulta);
    assert.equal(pool.chamadas.find((c) => c.sql === svc.SQL_CONTATO).params[2], "2026-10-08 12:00:00.000");
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
    // D/tem_cpf: comparação NO banco, saída só booleana; genéricos fora; raiz precisa ser raiz
    for (const sql of [svc.SQL_TEM_CPF, svc.SQL_CONFIRMAR_CPF]) {
      assert.doesNotMatch(sql, /now\(|current_(timestamp|date|time)|localtime/i);
      assert.match(sql, /id_locacaoorigem IS NULL/);
      assert.match(sql, /\$2::timestamp/);
      assert.match(sql, /genericos AS/);
      assert.match(sql, /NOT IN \(SELECT id_pessoa FROM genericos\)/);
      const saida = sql.slice(sql.lastIndexOf(")") + 1);
      assert.doesNotMatch(saida, /identificador|\bcpf\b/); // o CPF não está no SELECT final
    }
    assert.match(svc.SQL_CONFIRMAR_CPF, /left\(cpf, 3\) = \$3::text\) AS confere/);
    // E sem dado pessoal; F: raiz precisa ser raiz, janela por parâmetro, nome só se liberada, só nome+papel
    assert.doesNotMatch(svc.SQL_SUITES, /pessoa|now\(/i);
    assert.match(svc.SQL_SUITES, /dataexclusao IS NULL/);
    assert.doesNotMatch(svc.SQL_HOSPEDE, /now\(|current_/i);
    assert.match(svc.SQL_HOSPEDE, /id_locacaoorigem IS NULL/);
    assert.match(svc.SQL_HOSPEDE, /\$2::timestamp/);
    assert.match(svc.SQL_HOSPEDE, /WHERE s\.liberada/);
    assert.doesNotMatch(svc.SQL_HOSPEDE, /identificador|telefone|celular|email|nascimento/);
    assert.ok(!svc.SQL_CONFIRMAR_CPF.includes("$4"));
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
      providers: [svc.NpsService, NpsHmacGuard, tent.NpsTentativasService, { provide: TenantPoolService, useValue: pool }],
    })(TesteNpsModule);
    const guardar = (...a) => logs.push(a.map(String).join(" "));
    app = await NestFactory.create(TesteNpsModule, {
      rawBody: true,
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
  /** GET com X-LHG-Ator (assinado como 5ª linha, ou com outro ator para simular adulteração). */
  const comAtor = (cam, { id = "painel", seg = SP, ator = "u-42", atorAssinado = ator, enviarAtor = true } = {}) => {
    const ts = String(Math.floor(Date.now() / 1000));
    return fetch(base + cam, {
      headers: {
        "X-LHG-Key-Id": id,
        "X-LHG-Timestamp": ts,
        "X-LHG-Signature": hmac.assinarNps(seg, "GET", cam, ts, "", atorAssinado ?? undefined),
        ...(enviarAtor ? { "X-LHG-Ator": ator } : {}),
      },
    });
  };

  test("sem NPS_HMAC_KEYS: módulo DESLIGADO (404), mesmo com assinatura", async () => {
    delete process.env.NPS_HMAC_KEYS;
    assert.equal((await chamar(caminho(101))).status, 404);
  });

  test("A assinado → 200; sem cabeçalhos / outra chave / adulterado / atrasado / caminho do proxy → 401", async () => {
    process.env.NPS_HMAC_KEYS = `k1:${S1},k2:${S2},chat:${SC}:contato,painel:${SP}:nps_pessoal`;
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

  const postar = (corpo, { id = "k1", seg = S1, assinado, ts = Math.floor(Date.now() / 1000) } = {}) => {
    const bruto = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
    return fetch(base + "/nps/v1/confirmar-cpf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LHG-Key-Id": id,
        "X-LHG-Timestamp": String(ts),
        "X-LHG-Signature": hmac.assinarNps(seg, "POST", "/nps/v1/confirmar-cpf", String(ts), assinado ?? bruto),
      },
      body: bruto,
    });
  };

  test("D (chave do NPS): 200 {ok}; corpo adulterado → 401; chave do Chat LHG → 403; no-store", async () => {
    const ok = await postar({ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "123" });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ok.json(), { ok: true });
    const original = JSON.stringify({ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "999" });
    const r = await postar(original.replace("999", "123"), { assinado: original });
    assert.equal(r.status, 401);
    // JSON equivalente com outro espaçamento = outros bytes = outra assinatura
    assert.equal((await postar(original.replace(",", ", "), { assinado: original })).status, 401);
    assert.equal((await postar({ unidade: "lush_ipiranga", raiz: "4990", prefixo3: "123" }, { id: "chat", seg: SC })).status, 403);
  });

  test("D: erros contam, 3º bloqueia (distinguível) e nem o certo passa; sem_cpf; sem_estadia → 404; 400", async () => {
    const corpo = (p, raiz = "4990") => ({ unidade: "lush_ipiranga", raiz, prefixo3: p });
    assert.deepEqual(await (await postar(corpo("901"))).json(), { ok: false, tentativas_restantes: 2 });
    assert.deepEqual(await (await postar(corpo("902"))).json(), { ok: false, tentativas_restantes: 1 });
    assert.deepEqual(await (await postar(corpo("903"))).json(), { ok: false, bloqueado: true, retry_after: 14400 });
    const b = await (await postar(corpo("123"))).json();
    assert.equal(b.bloqueado, true);
    assert.ok(b.retry_after > 14000 && b.retry_after <= 14400);
    assert.deepEqual(await (await postar(corpo("123", "5003"))).json(), { ok: false, sem_cpf: true });
    const sem = await postar(corpo("123", "5001"));
    assert.equal(sem.status, 404);
    assert.deepEqual(await sem.json(), { ok: false, motivo: "sem_estadia" });
    assert.equal((await postar(corpo("12"))).status, 400);
    assert.equal((await postar("isto não é json")).status, 400);
  });

  test("E (chave do NPS) → 200 com as suítes; chave do painel ou do Chat LHG → 403", async () => {
    const r = await chamar("/nps/v1/suites?unidade=lush_ipiranga");
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.unidade, "lush_ipiranga");
    assert.deepEqual(j.suites[0], { suite: 101, categoria_id: 17, categoria_nome: "Lush Spa", categoria_sigla: "LS" });
    assert.equal(j.cache, undefined); // o indicador de cache fica só no log
    assert.equal((await comoChat("/nps/v1/suites?unidade=lush_ipiranga")).status, 403);
    assert.equal((await comAtor("/nps/v1/suites?unidade=lush_ipiranga")).status, 403);
    assert.equal((await chamar("/nps/v1/suites?unidade=x")).status, 400);
  });

  test("F: só a chave nps_pessoal, com ator ASSINADO; no-store; 404 com motivo", async () => {
    const cam = "/nps/v1/hospede?unidade=lush_ipiranga&raiz=4990";
    const ok = await comAtor(cam);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ok.json(), {
      unidade: "lush_ipiranga",
      raiz: "4990",
      pessoas: [{ nome: NOME_A, papel: "reserva" }, { nome: NOME_B, papel: "acompanhante" }],
    });
    assert.equal((await comAtor(cam, { id: "k1", seg: S1 })).status, 403); // chave do NPS
    assert.equal((await comAtor(cam, { id: "chat", seg: SC })).status, 403); // chave do Chat LHG
    assert.equal((await comAtor(cam, { atorAssinado: "u-99" })).status, 401); // ator trocado
    assert.equal((await comAtor(cam, { enviarAtor: false })).status, 401); // ator retirado
    assert.equal((await comAtor(cam, { ator: "fulano@exemplo.invalid" })).status, 401); // fora do formato
    const sem = await comAtor(cam, { enviarAtor: false, atorAssinado: null });
    assert.equal(sem.status, 400); // assinado sem ator, mas a rota exige
    assert.equal((await sem.json()).message, "X-LHG-Ator obrigatório");
    const fora = await comAtor("/nps/v1/hospede?unidade=lush_ipiranga&raiz=5002");
    assert.equal(fora.status, 404);
    assert.equal((await fora.json()).motivo, "fora_da_janela");
    assert.equal((await (await comAtor("/nps/v1/hospede?unidade=lush_ipiranga&raiz=123")).json()).motivo, "nao_encontrada");
    assert.equal((await comAtor(caminho(101))).status, 403); // a chave do painel não acessa o A
  });

  test("C variante: só a chave do Chat LHG, ator obrigatório e assinado, 10/min", async () => {
    const cam = "/nps/v1/contato?unidade=lush_ipiranga&locacao=8001&finalidade=retorno_avaliacao";
    const semAtor = await comoChat(cam);
    assert.equal(semAtor.status, 400);
    assert.equal((await semAtor.json()).message, "X-LHG-Ator obrigatório");
    const ok = await comAtor(cam, { id: "chat", seg: SC });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { celular: E164_FICTICIO, origem_reserva: "RESERVA_API" });
    assert.equal((await comAtor(cam, { id: "chat", seg: SC, atorAssinado: "u-1" })).status, 401);
    assert.equal((await comAtor(cam, { id: "painel", seg: SP })).status, 403);
    assert.equal((await comoChat(cam.replace("retorno_avaliacao", "marketing"))).status, 400);
    const status = [];
    for (let i = 0; i < 10; i++) status.push((await comAtor(cam, { id: "chat", seg: SC })).status);
    assert.equal(status.filter((x) => x === 200).length, 9); // 1 + 9 = 10 no minuto
    assert.equal(status[9], 429);
    // o C do convite (sem finalidade) não entra nesse limite
    assert.equal((await comoChat("/nps/v1/contato?unidade=lush_ipiranga&locacao=8001")).status, 200);
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
    assert.match(tudo, /nps\.confirmar_cpf key=k1 unidade=lush_ipiranga raiz=4990 resultado=confere/);
    assert.match(tudo, /nps\.confirmar_cpf key=k1 unidade=lush_ipiranga raiz=4990 resultado=nao_confere restantes=1/);
    assert.match(tudo, /nps\.confirmar_cpf key=k1 unidade=lush_ipiranga raiz=4990 resultado=bloqueado/);
    assert.match(tudo, /nps\.confirmar_cpf key=k1 unidade=lush_ipiranga raiz=5003 resultado=sem_cpf/);
    assert.match(tudo, /nps\.recusado motivo=escopo key=chat rota=nps/);
    assert.match(tudo, /nps\.suites key=k1 unidade=lush_ipiranga suites=2 cache=(sim|nao)/);
    assert.match(tudo, /nps\.hospede key=painel unidade=lush_ipiranga raiz=4990 ator=u-42 resultado=entregue pessoas=2/);
    assert.match(tudo, /nps\.hospede key=painel unidade=lush_ipiranga raiz=5002 ator=u-42 resultado=fora_da_janela/);
    assert.match(tudo, /nps\.contato key=chat unidade=lush_ipiranga locacao=8001 finalidade=retorno_avaliacao ator=u-42 resultado=entregue/);
    assert.match(tudo, /nps\.recusado motivo=escopo key=painel rota=nps/);
    // nenhum NOME no log
    assert.ok(!tudo.includes(NOME_A) && !tudo.includes(NOME_B) && !tudo.includes("Ficticia"));
    // o PREFIXO nunca vai para o log
    // (tira a raiz e o contador, que são números legítimos da linha, e procura os prefixos usados)
    for (const linha of logs.filter((l) => l.includes("confirmar_cpf"))) {
      const resto = linha.replace(/raiz=\d+/, "").replace(/restantes=\d/, "");
      assert.doesNotMatch(resto, /prefix|\b(123|456|90[1-3]|99[7-9]|12)\b/);
    }
    for (const s of [S1, S2, SC, SP]) assert.ok(!tudo.includes(s));
    assert.doesNotMatch(tudo, /[0-9a-f]{64}/);
    assert.ok(!tudo.includes(E164_FICTICIO) && !tudo.includes("900000001") && !tudo.includes("90000-0001"));
  });
});
