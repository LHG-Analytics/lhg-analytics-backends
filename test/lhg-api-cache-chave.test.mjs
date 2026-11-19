// Chave do cache de KPIs (período CUSTOM): o INSTANTE exato, não só a data.
// Antes, o pedido do dashboard "dia 1 até ontem" (06:00 UTC → 05:59 UTC do dia
// seguinte) e a previsão do mês (06:00 de Brasília = 09:00 UTC) tinham a MESMA
// chave (só as datas) e um recebia o cálculo do outro (ex.: Lapa, 1–18/11/2026:
// 5 locações e 2 reservas de diferença). Rodar depois do build: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("reflect-metadata");
const moment = require("moment-timezone");
const { DateUtilsService } = require("@lhg/utils");
const { KpiCacheService } = require("../lhg-api/dist/cache/kpi-cache.service.js");
const { CachePeriodEnum } = require("../lhg-api/dist/cache/cache.interfaces.js");
const { datasDoServico } = require("../lhg-api/dist/common/datas-do-servico.js");
const { periodosDoWarmup } = require("../lhg-api/dist/cache/cache.controller.js");

const CUSTOM = CachePeriodEnum.CUSTOM;
// O que o CompanyController monta para 01/11/2026–18/11/2026 (dia comercial, UTC).
const pedido = {
  start: new Date("2026-11-01T06:00:00Z"),
  end: new Date("2026-11-19T05:59:59Z"),
};
// A previsão do mês (company.service): dia 1 06:00 → ontem+1 05:59:59 em Brasília.
const previsao = {
  start: new Date("2026-11-01T09:00:00Z"),
  end: new Date("2026-11-19T08:59:59Z"),
};

test("REPRODUZ a colisão: as mesmas datas e horários diferentes NÃO dividem mais a chave", async () => {
  const cache = new KpiCacheService(); // sem REDIS_URL: Map em memória
  // O formato antigo (só a data) era IGUAL para os dois:
  const soData = (r) =>
    `${moment(r.start).format("YYYY-MM-DD")}:${moment(r.end).format("YYYY-MM-DD")}`;
  assert.equal(soData(pedido), soData(previsao));
  // O novo é diferente:
  assert.notEqual(
    cache.buildCacheKey("lush_lapa", "company", CUSTOM, pedido),
    cache.buildCacheKey("lush_lapa", "company", CUSTOM, previsao),
  );
  // E cada cálculo fica com o SEU resultado (antes, o 2º recebia o do 1º).
  const a = await cache.getOrCalculate("lush_lapa", "company", CUSTOM, async () => "PREVISAO", previsao);
  const b = await cache.getOrCalculate("lush_lapa", "company", CUSTOM, async () => "PEDIDO", pedido);
  assert.equal(a.data, "PREVISAO");
  assert.equal(b.data, "PEDIDO");
  assert.equal(b.fromCache, false);
  // O mesmo instante continua vindo do cache.
  const c = await cache.getOrCalculate("lush_lapa", "company", CUSTOM, async () => "OUTRO", pedido);
  assert.equal(c.data, "PEDIDO");
  assert.equal(c.fromCache, true);
});

test("chave CUSTOM: instante UTC ao segundo, sem ':' no instante", () => {
  const cache = new KpiCacheService();
  assert.equal(
    cache.buildCacheKey("tout", "bookings", CUSTOM, pedido),
    "kpi:tout:bk:custom:2026-11-01T060000:2026-11-19T055959",
  );
  assert.equal(cache.buildCacheKey("tout", "company", CachePeriodEnum.LAST_7_D), "kpi:tout:cp:last_7_d");
});

test("os controllers continuam convertendo as datas EXATAMENTE como antes (opções compartilhadas)", () => {
  const du = new DateUtilsService();
  const ini = { useUTC: true, startHour: 6, startMinute: 0, startSecond: 0 };
  const fim = { isEndDate: true, useUTC: true, endHour: 5, endMinute: 59, endSecond: 59 };
  // Opções literais que cada controller usava antes da refatoração:
  const antes = {
    company: [ini, { ...fim, addDayForEndDate: true }],
    bookings: [ini, fim],
    governance: [ini, fim],
    restaurant: [{ useUTC: true }, { isEndDate: true, useUTC: true }],
  };
  for (const [svc, [oi, of]] of Object.entries(antes)) {
    const { start, end } = datasDoServico(du, svc, "01/11/2026", "18/11/2026");
    assert.equal(start.toISOString(), du.convertToDate("01/11/2026", oi).toISOString(), `${svc} início`);
    assert.equal(end.toISOString(), du.convertToDate("18/11/2026", of).toISOString(), `${svc} fim`);
  }
  // A Visão Geral do dia comercial: 06:00 → 05:59:59 de D+1.
  const c = datasDoServico(du, "company", "01/11/2026", "18/11/2026");
  assert.equal(c.start.toISOString(), "2026-11-01T06:00:00.000Z");
  assert.equal(c.end.toISOString().slice(0, 19), "2026-11-19T05:59:59");
});

test("warmup: períodos no fuso de Brasília (às 22:30 de 19/11 ainda é dia 19, não 20 como em UTC)", () => {
  const p = periodosDoWarmup(moment.tz("2026-11-19 22:30", "America/Sao_Paulo"));
  const por = Object.fromEntries(p.map((x) => [x.name, `${x.inicio}–${x.fim}`]));
  assert.deepEqual(por, {
    LAST_7_D: "12/11/2026–19/11/2026",
    LAST_MONTH: "01/10/2026–31/10/2026",
    THIS_MONTH: "01/11/2026–19/11/2026",
    YEAR_TO_DATE: "01/01/2026–19/11/2026",
  });
});
