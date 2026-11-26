// Vigia das réplicas do Automo (lhg-api): atraso medido no banco, aviso
// "dados até…" para as telas (GET /api/replicas, só as unidades da pessoa) e
// e-mail — um por unidade por dia, mais o "voltou ao normal". Pool e Resend
// FALSOS, cache em memória. Rodar depois do build: node --test test/
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../lhg-api/package.json", import.meta.url));
require("reflect-metadata");
delete process.env.REDIS_URL;
process.env.RESEND_API_KEY = "re_teste_ficticio";
delete process.env.ALERTA_REPLICA_PARA;
const regras = require("../lhg-api/dist/replica/replica.regras.js");
const { ReplicaService } = require("../lhg-api/dist/replica/replica.service.js");
const { ReplicaController } = require("../lhg-api/dist/replica/replica.controller.js");
const { KpiCacheService } = require("../lhg-api/dist/cache/kpi-cache.service.js");

const GARAVELO = { slug: "getan_garavelo", displayName: "Getan Garavelo" };

describe("regras", () => {
  const agora = new Date("2026-11-26T15:00:00Z");
  test("atraso acima do limite → atrasada, com 'dados até' no fuso da unidade", () => {
    const s = regras.avaliar(GARAVELO, { replica: true, ultimo: "2026-11-10T08:06:00Z", atraso_s: 23495 * 60 }, 120, agora);
    assert.equal(s.atrasada, true);
    assert.equal(s.atrasoMin, 23495);
    assert.equal(s.dadosAte, "dados até 10/11 05:06");
    assert.equal(s.aviso, "dados até 10/11 05:06");
    const liv = regras.avaliar({ slug: "liv", displayName: "Liv" }, { replica: true, ultimo: "2026-11-10T08:06:00Z", atraso_s: 999999 }, 120, agora);
    assert.equal(liv.dadosAte, "dados até 10/11 03:06"); // Guayaquil, UTC−5
  });
  test("dentro do limite, banco primário e sem conexão", () => {
    assert.equal(regras.avaliar(GARAVELO, { replica: true, ultimo: "x", atraso_s: 119 * 60 }, 120, agora).atrasada, false);
    const p = regras.avaliar(GARAVELO, { replica: false, ultimo: null, atraso_s: null }, 120, agora);
    assert.equal(p.atrasada, false);
    assert.equal(p.aviso, null);
    const f = regras.avaliar(GARAVELO, null, 120, agora);
    assert.equal(f.conecta, false);
    assert.equal(f.atrasada, true);
    assert.equal(f.aviso, "sem conexão com o servidor da unidade");
  });
  test("um aviso por dia; 'voltou ao normal' só depois de um atraso", () => {
    const at = { atrasada: true };
    const ok = { atrasada: false };
    let r = regras.decidir(null, at, "2026-11-26");
    assert.equal(r.aviso, "atrasada");
    r = regras.decidir(r.novo, at, "2026-11-26");
    assert.equal(r.aviso, null);
    r = regras.decidir(r.novo, at, "2026-11-27");
    assert.equal(r.aviso, "atrasada");
    r = regras.decidir(r.novo, ok, "2026-11-27");
    assert.equal(r.aviso, "normalizou");
    assert.equal(regras.decidir(r.novo, ok, "2026-11-27").aviso, null);
    assert.equal(regras.decidir(null, ok, "2026-11-27").aviso, null);
  });
  test("e-mail: unidade, último replay, há quanto tempo; ambiente fora de prod no assunto", () => {
    const s = regras.avaliar(GARAVELO, { replica: true, ultimo: "2026-11-10T08:06:00Z", atraso_s: 23495 * 60 }, 120, agora);
    const m = regras.montarEmail("atrasada", s, "prod");
    assert.equal(m.assunto, "LHG Analytics: réplica de Getan Garavelo atrasada (há 16 dias)");
    assert.match(m.texto, /Último dado replicado: 10\/11\/2026 05:06 — há 16 dias/);
    assert.match(regras.montarEmail("atrasada", s, "dev").assunto, /^\[DEV\] /);
    assert.match(regras.montarEmail("normalizou", s, "prod").assunto, /voltou ao normal/);
    assert.match(regras.montarEmail("atrasada", regras.avaliar(GARAVELO, null, 120, agora), "prod").assunto, /sem conexão/);
    assert.equal(regras.haQuanto(150), "há 2 h");
    assert.equal(regras.haQuanto(45), "há 45 min");
  });
});

describe("serviço e rota", () => {
  let linhas; // slug → linha do banco (null = sem conexão)
  const emails = [];
  let resendOk = true;
  let s;
  before(() => {
    const pool = {
      async query(slug, sql) {
        assert.match(sql, /pg_last_xact_replay_timestamp/);
        const l = linhas[slug];
        if (l === null) throw new Error("connect ECONNREFUSED");
        return [l ?? { replica: true, ultimo: "2026-11-26T14:58:00Z", atraso_s: 120 }];
      },
    };
    s = new ReplicaService(pool, new KpiCacheService());
    s.enviarHttp = async (url, init) => {
      emails.push({ url, corpo: JSON.parse(init.body), auth: init.headers.Authorization });
      return { ok: resendOk, status: resendOk ? 200 : 500 };
    };
  });

  test("Garavelo atrasado e PQ Oeste fora: 2 e-mails no dia; nada a mais no 2º ciclo; dia seguinte avisa de novo; normaliza", async () => {
    linhas = {
      getan_garavelo: { replica: true, ultimo: "2026-11-10T08:06:00Z", atraso_s: 23495 * 60 },
      getan_pq_oeste: null,
    };
    s.agora = () => new Date("2026-11-26T15:00:00Z");
    const r = await s.verificar();
    assert.equal(r.length, 12);
    assert.deepEqual(r.filter((x) => x.atrasada).map((x) => x.unidade).sort(), ["getan_garavelo", "getan_pq_oeste"]);
    assert.equal(emails.length, 2);
    assert.deepEqual(emails[0].corpo.to, ["danilo@lhgmoteis.com.br"]);
    assert.equal(emails[0].url, "https://api.resend.com/emails");
    assert.match(emails.map((e) => e.corpo.subject).join("|"), /Garavelo atrasada \(há 16 dias\)/);

    await s.verificar(); // mesmo dia
    assert.equal(emails.length, 2);

    s.agora = () => new Date("2026-11-27T15:00:00Z"); // dia seguinte (São Paulo)
    await s.verificar();
    assert.equal(emails.length, 4);

    linhas.getan_garavelo = { replica: true, ultimo: "2026-11-27T14:59:00Z", atraso_s: 60 };
    await s.verificar();
    assert.equal(emails.length, 5);
    assert.match(emails[4].corpo.subject, /Garavelo voltou ao normal/);
  });

  test("Resend falhou: o estado não muda e o aviso sai no ciclo seguinte", async () => {
    linhas.getan_grid = { replica: true, ultimo: "2026-11-27T08:00:00Z", atraso_s: 7 * 3600 };
    resendOk = false;
    const n = emails.length;
    await s.verificar();
    const tentativas = emails.length - n;
    assert.ok(tentativas >= 1);
    resendOk = true;
    await s.verificar();
    const grid = emails.slice(n + tentativas).filter((e) => /Grid/.test(e.corpo.subject));
    assert.equal(grid.length, 1);
  });

  test("GET /api/replicas: gerente vê só a unidade dele; LHG vê todas; campo 'aviso' pronto para a tela", () => {
    const c = new ReplicaController(s);
    const g = c.status({ user: { unit: "TOUT" } });
    assert.deepEqual(g.unidades.map((x) => x.unidade), ["tout"]);
    assert.equal(g.unidades[0].aviso, null);
    const a = c.status({ user: { unit: "LHG" } });
    assert.equal(a.unidades.length, 12);
    assert.equal(a.unidades.find((x) => x.unidade === "getan_pq_oeste").aviso, "sem conexão com o servidor da unidade");
    assert.equal(a.atrasoMaxMin, 120);
  });
});
