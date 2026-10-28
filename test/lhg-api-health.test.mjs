// O /health do lhg-api é o alvo "api" do /health agregado do proxy (Health
// Check Path do Render). Ele precisa ser LIVENESS: não pode tocar banco
// (AUTOMO das unidades) nem serviço externo, senão uma oscilação de rede faria
// o Render reiniciar a instância. Rodar depois do build: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("reflect-metadata");
const { HealthController } = require("../lhg-api/dist/health.controller.js");

test("o HealthController do lhg-api não recebe nenhuma dependência (sem pool, sem banco)", () => {
  const deps = Reflect.getMetadata("design:paramtypes", HealthController) ?? [];
  assert.equal(deps.length, 0);
  assert.equal(HealthController.length, 0);
});

test("health() responde na hora, sem I/O (síncrono, não é Promise)", () => {
  const out = new HealthController().health();
  assert.ok(!(out instanceof Promise));
  assert.equal(out.status, "ok");
});
