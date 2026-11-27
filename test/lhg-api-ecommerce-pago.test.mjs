// Receita de e-commerce (site, origem 4) = valor PAGO: o lançamento RESERVA
// "cabeça" (sem id_contapagarreceber), não excluído, de reservas não canceladas.
// As parcelas do cartão também são lançamentos RESERVA (com
// id_contapagarreceber) e, enquanto não processadas, têm versao 0: o filtro
// antigo "versao = 0" as somava (o mês corrente aparecia inflado) e perdia a
// cabeça já editada (versao > 0).
// O SQL real roda num schema descartável (TEST_DATABASE_URL; no CI, o Postgres
// do job). Valores FICTÍCIOS. Rodar depois do build: node --test test/
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../lhg-api/package.json", import.meta.url));
const { sqlFaturamentoPorCanal } = require("../lhg-api/dist/bookings/bookings-canais.sql.js");
const consolidado = require("../lhg-api/dist/consolidated/bookings/sql/bookings.queries.js");

test("nenhuma consulta de e-commerce filtra mais por versao = 0; todas usam a cabeça (id_contapagarreceber nulo)", () => {
  const sqls = [
    sqlFaturamentoPorCanal("2026-11-01 00:00:00", "2026-11-30 23:59:59"),
    consolidado.getBookingsBigNumbersSQL("tout", "01/11/2026", "30/11/2026"),
    consolidado.getBillingByDateSQL("tout", "01/11/2026", "30/11/2026"),
    consolidado.getEcommerceBigNumbersSQL("tout", "01/11/2026", "30/11/2026"),
    consolidado.getEcommerceByDateSQL("tout", "01/11/2026", "30/11/2026"),
  ];
  for (const s of sqls) {
    if (!/novo_lancamento/.test(s)) continue;
    assert.doesNotMatch(s, /"versao"\s*=\s*0/);
    assert.match(s, /nl\."id_contapagarreceber" IS NULL/);
  }
});

describe("valor pago no SQL real", { skip: !process.env.TEST_DATABASE_URL && "sem TEST_DATABASE_URL" }, () => {
  const schema = `ecom_teste_${crypto.randomBytes(4).toString("hex")}`;
  let c;
  after(async () => {
    if (!c) return;
    await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await c.end();
  });

  test("parcelada, cupom, cabeça processada, lançamento excluído e reserva cancelada", async () => {
    const pg = require("pg");
    c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    await c.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE reserva (id int PRIMARY KEY, id_tipoorigemreserva int, datainicio timestamp, dataatendimento timestamp,
        reserva_programada_guia boolean, periodocontratado text, cancelada timestamp, valorcontratado numeric, desconto_reserva numeric);
      CREATE TABLE novo_lancamento (id serial PRIMARY KEY, id_originado int, valor numeric, versao int, dataexclusao timestamp,
        tipolancamento text, id_contapagarreceber int);`);
    const res = (id, origem, contratado, { cancelada = null, desconto = 0 } = {}) =>
      c.query(`INSERT INTO reserva VALUES ($1,$2,'2026-11-27 22:30','2026-11-27 10:15',false,NULL,$3,$4,$5)`, [id, origem, cancelada, contratado, desconto]);
    const lanc = (r, valor, { versao = 0, cpr = null, excl = null } = {}) =>
      c.query(`INSERT INTO novo_lancamento (id_originado, valor, versao, dataexclusao, tipolancamento, id_contapagarreceber) VALUES ($1,$2,$3,$4,'RESERVA',$5)`, [r, valor, versao, excl, cpr]);

    // 1) Parcelada em 3×, parcelas ainda não processadas (versao 0): conta 1.566, não 3.132.
    await res(1, 4, 1434);
    await lanc(1, 1566);
    for (const k of [1, 2, 3]) await lanc(1, 522, { cpr: 100 + k });
    // 2) Cabeça já editada pelo Automo (versao 2) e parcelas processadas: conta 900 (antes: 0).
    await res(2, 4, 900);
    await lanc(2, 900, { versao: 2 });
    for (const k of [1, 2]) await lanc(2, 450, { versao: 1, cpr: 200 + k });
    // 3) Cupom de 40% (BLACK40OFF): contratado 1.036 e desconto 467,20; pago 700,80 em 3×.
    await res(3, 4, 1036, { desconto: 467.2 });
    await lanc(3, 700.8);
    for (const k of [1, 2, 3]) await lanc(3, 233.6, { cpr: 300 + k });
    // 4) Cancelada: fora.
    await res(4, 4, 500, { cancelada: "2026-11-27 11:00" });
    await lanc(4, 500);
    // 5) Lançamento excluído (estorno) fora; a cabeça válida conta.
    await res(5, 4, 300);
    await lanc(5, 999, { excl: "2026-11-27 12:00" });
    await lanc(5, 300);
    // 6) Outro canal (balcão): segue pelo valorcontratado.
    await res(6, 1, 200);

    const linhas = (await c.query(sqlFaturamentoPorCanal("2026-11-27 00:00:00", "2026-11-27 23:59:59"))).rows;
    const por = Object.fromEntries(linhas.map((l) => [l.channel_type, l]));
    assert.equal(Number(por.WEBSITE_IMMEDIATE.totalValue), 1566 + 900 + 700.8 + 300);
    assert.equal(Number(por.WEBSITE_IMMEDIATE.totalBookings), 4);
    assert.equal(Number(por.INTERNAL.totalValue), 200);

    // O critério antigo dava (1566 + 3×522) + 0 + (700,80 + 3×233,60) + 300 = 4.833,60.
    const antigo = (await c.query(sqlFaturamentoPorCanal("2026-11-27 00:00:00", "2026-11-27 23:59:59")
      .replace('nl."id_contapagarreceber" IS NULL', 'nl."versao" = 0'))).rows;
    assert.equal(Number(antigo.find((l) => l.channel_type === "WEBSITE_IMMEDIATE").totalValue), 4833.6);
  });
});
