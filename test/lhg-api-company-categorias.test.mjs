// Categorias de suíte da unidade no lhg-api (GET /:unit/api/Company/categorias,
// usado pela ferramenta listar_categorias do MCP): ID do Automo, nome e suítes
// ativas, só dos IDs do registry, com cache de 6 h. Pool FALSO, sem banco.
// Rodar depois do build: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../lhg-api/package.json", import.meta.url));
require("reflect-metadata");
const { CompanyService } = require("../lhg-api/dist/company/company.service.js");
const { getTenant } = require("../lhg-api/dist/tenant/tenant.registry.js");

test("categorias: IDs do registry no SQL, campos normalizados e cache por unidade", async () => {
  const chamadas = [];
  const pool = {
    async query(slug, sql) {
      chamadas.push({ slug, sql });
      return [
        { id: 6, nome: " A ", suites: "13" },
        { id: 10, nome: null, suites: "0" },
      ];
    },
  };
  const s = new CompanyService(pool, {});
  const tout = getTenant("tout");
  const r = await s.listarCategorias(tout);
  assert.deepEqual(r, [
    { id: 6, nome: "A", suites: 13 },
    { id: 10, nome: "", suites: 0 },
  ]);
  assert.match(chamadas[0].sql, new RegExp(`ca\\.id IN \\(${tout.suiteCategoryIds.join(",")}\\)`));
  assert.match(chamadas[0].sql, /dataexclusao IS NULL/);
  // 2ª vez: do cache, sem consultar o banco; outra unidade consulta.
  await s.listarCategorias(tout);
  assert.equal(chamadas.length, 1);
  await s.listarCategorias(getTenant("altana"));
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[1].slug, "altana");
});

const { TenantPoolService, UnidadeIndisponivelError, ehFalhaDeConexao } = require("../lhg-api/dist/database/tenant-pool.service.js");
const { CompanyController, UNIDADE_INDISPONIVEL } = require("../lhg-api/dist/company/company.controller.js");

test("falha de CONEXÃO com o banco da unidade vira UnidadeIndisponivelError; erro de SQL não", async () => {
  for (const e of [
    Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    Object.assign(new Error("x"), { code: "ETIMEDOUT" }),
    new Error("Connection terminated due to connection timeout"),
    new Error("timeout exceeded when trying to connect"),
  ])
    assert.equal(ehFalhaDeConexao(e), true, e.message);
  for (const e of [
    Object.assign(new Error('relation "x" does not exist'), { code: "42P01" }),
    Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }),
    null,
  ])
    assert.equal(ehFalhaDeConexao(e), false);

  const svc = new TenantPoolService();
  svc.pools.set("getan_pq_oeste", { query: async () => { throw new Error("Connection terminated due to connection timeout"); } });
  svc.pools.set("tout", { query: async () => { throw Object.assign(new Error("syntax"), { code: "42601" }); } });
  await assert.rejects(svc.query("getan_pq_oeste", "select 1"), (e) => e instanceof UnidadeIndisponivelError && e.slug === "getan_pq_oeste");
  await assert.rejects(svc.queryWithParams("tout", "select 1", []), (e) => !(e instanceof UnidadeIndisponivelError) && e.code === "42601");
});

test("controller: unidade fora → 503 UNIDADE_INDISPONIVEL (categorias e KPIs; os KPIs davam 400)", async () => {
  const fora = { listarCategorias: async () => { throw new UnidadeIndisponivelError("x"); }, calculateKpisByDateRangeSQL: async () => { throw new UnidadeIndisponivelError("x"); } };
  const datas = { convertToDate: () => new Date() };
  const c = new CompanyController(fora, datas, { validateDateInterval: () => undefined });
  for (const chamada of [() => c.getCategorias(getTenant("tout")), () => c.getKpisByDateRange(getTenant("tout"), "01/10/2026", "31/10/2026")]) {
    await assert.rejects(chamada(), (e) => e.getStatus?.() === 503 && e.getResponse().message === UNIDADE_INDISPONIVEL);
  }
});
