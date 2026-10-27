// Testes do /health agregado do proxy (Health Check Path do Render).
// Rodar a partir da raiz do repo: node --test test/
// Usa servidores falsos no lugar do auth e do lhg-api; não precisa de banco.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

// Servidor falso cujo comportamento muda durante o teste.
function fakeServer() {
  const state = { status: 200, delayMs: 0, hits: 0 };
  const server = http.createServer((_req, res) => {
    state.hits += 1;
    setTimeout(() => {
      res.writeHead(state.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: state.status === 200 ? "ok" : "x" }));
    }, state.delayMs);
  });
  return { state, server };
}

const auth = fakeServer();
const api = fakeServer();
let proxy;
let base;

const get = async (path) => {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.json() };
};

before(async () => {
  const [pAuth, pApi, pProxy] = await Promise.all([freePort(), freePort(), freePort()]);
  await new Promise((r) => auth.server.listen(pAuth, r));
  await new Promise((r) => api.server.listen(pApi, r));
  proxy = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      PORT: String(pProxy),
      HEALTH_AUTH_URL: `http://127.0.0.1:${pAuth}/api/health`,
      HEALTH_API_URL: `http://127.0.0.1:${pApi}/health`,
    },
    stdio: "ignore",
  });
  base = `http://127.0.0.1:${pProxy}`;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(base + "/health");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("proxy não subiu");
});

after(() => {
  proxy?.kill();
  auth.server.close();
  api.server.close();
});

test("200 quando auth e lhg-api respondem ao liveness", async () => {
  auth.state.status = 200;
  api.state.status = 200;
  const r = await get("/health");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: "ok", checks: { auth: "ok", api: "ok" } });
});

test("503 indicando quem caiu quando um processo não responde 200", async () => {
  auth.state.status = 200;
  api.state.status = 500;
  const r = await get("/health");
  assert.equal(r.status, 503);
  assert.deepEqual(r.body.checks, { auth: "ok", api: "down" });
  api.state.status = 200;
});

test("503 quando um processo trava além do timeout de 2 s", async () => {
  auth.state.delayMs = 2500;
  const r = await get("/health");
  assert.equal(r.status, 503);
  assert.equal(r.body.checks.auth, "down");
  auth.state.delayMs = 0;
});

test("resposta sem versão, host ou detalhe interno", async () => {
  const r = await get("/health");
  assert.deepEqual(Object.keys(r.body).sort(), ["checks", "status"]);
  assert.doesNotMatch(JSON.stringify(r.body), /127\.0\.0\.1|localhost|\d+\.\d+\.\d+/);
});
