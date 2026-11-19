// Resumo enxuto do Painel TV no lhg-api (/:unit/api/Painel/resumo): as somas
// têm de ser as MESMAS do dashboard (TotalResult da Visão Geral e BigNumbers
// das Reservas), e o SQL tem de ser o MESMO texto compartilhado. Rodar depois
// do build: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  totaisDasCategorias,
  totaisDasReservas,
} = require("../lhg-api/dist/painel/painel-totais.js");
const { sqlTotaisPorCategoria, cteDadosPorCategoria } = require(
  "../lhg-api/dist/company/company-categorias.sql.js",
);
const { sqlFaturamentoPorCanal } = require(
  "../lhg-api/dist/bookings/bookings-canais.sql.js",
);

const LUSH = [
  "EXPEDIA",
  "BOOKING",
  "GUIA_SCHEDULED",
  "GUIA_GO",
  "INTERNAL",
  "WEBSITE_IMMEDIATE",
  "WEBSITE_SCHEDULED",
];
const GETAN = ["GUIA_SCHEDULED", "GUIA_GO", "INTERNAL"];

test("faturamento e locações = soma das categorias (TotalResult), faturamento com 2 casas", () => {
  assert.deepEqual(
    totaisDasCategorias([
      { total_rentals: "10", total_value: "1000.1234" },
      { total_rentals: "5", total_value: "500.0049" },
    ]),
    { faturamento: 1500.13, locacoes: 15 },
  );
  assert.deepEqual(totaisDasCategorias([]), { faturamento: 0, locacoes: 0 });
});

test("reservas: só os canais da unidade; e-commerce = site imediato + programado; Guia = GO + programado", () => {
  const r = totaisDasReservas(
    [
      { channel_type: "WEBSITE_IMMEDIATE", totalValue: "600.00", totalBookings: "5" },
      { channel_type: "WEBSITE_SCHEDULED", totalValue: "400.50", totalBookings: "2" },
      { channel_type: "GUIA_GO", totalValue: "300.10", totalBookings: "3" },
      { channel_type: "GUIA_SCHEDULED", totalValue: "200.20", totalBookings: "2" },
      { channel_type: "INTERNAL", totalValue: "100.00", totalBookings: "1" },
      // canal fora da lista da unidade: não entra em nada
      { channel_type: "CANAL_99", totalValue: "999.00", totalBookings: "9" },
    ],
    LUSH,
  );
  assert.deepEqual(r, {
    faturamentoReservas: 1600.8,
    reservas: 13,
    reservasEcommerce: 7,
    receitaEcommerce: 1000.5,
    reservasGuia: 5,
    receitaGuia: 500.3,
  });
});

test("Getan (sem site): e-commerce 0 e só o Guia", () => {
  const r = totaisDasReservas(
    [
      { channel_type: "GUIA_GO", totalValue: "180.00", totalBookings: "4" },
      { channel_type: "GUIA_SCHEDULED", totalValue: "95.50", totalBookings: "1" },
      { channel_type: "INTERNAL", totalValue: "50.00", totalBookings: "2" },
    ],
    GETAN,
  );
  assert.equal(r.reservasEcommerce, 0);
  assert.equal(r.receitaEcommerce, 0);
  assert.equal(r.reservasGuia, 5);
  assert.equal(r.receitaGuia, 275.5);
  assert.equal(r.reservas, 7);
});

test("o SQL do resumo usa os MESMOS trechos do dashboard (sem período anterior nem previsão)", () => {
  const sql = sqlTotaisPorCategoria("1,2", "2026-10-01 06:00:00", "2026-11-01 05:59:59");
  assert.ok(sql.includes(cteDadosPorCategoria("1,2", "2026-10-01 06:00:00", "2026-11-01 05:59:59")));
  assert.match(sql, /INNER JOIN suite_counts sc ON scd\.suite_category_name = sc\.suite_category_name/);
  assert.doesNotMatch(sql, /limpezaapartamento|defeito/);
  const canais = sqlFaturamentoPorCanal("2026-10-01 00:00:00", "2026-10-31 23:59:59");
  assert.match(canais, /novo_lancamento/);
  assert.match(canais, /BETWEEN '2026-10-01 00:00:00' AND '2026-10-31 23:59:59'/);
});
