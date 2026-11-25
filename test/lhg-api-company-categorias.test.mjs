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
