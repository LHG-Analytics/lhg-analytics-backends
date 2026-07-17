import "module-alias/register.js";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

// ⚠️ REMOVE "/auth" antes de enviar para o Nest (que escuta em /api)
app.use(
  "/auth",
  createProxyMiddleware({
    target: "http://localhost:3005",
    changeOrigin: true,
    secure: false,
    logLevel: "debug",
    pathRewrite: {
      "^/auth": "", // remove "/auth" da URL
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(
        `🔄 Proxy encaminhando para: http://localhost:3005${req.originalUrl}`
      );
      if (req.headers["authorization"]) {
        proxyReq.setHeader("Authorization", req.headers["authorization"]);
      }
    },
  })
);

// Backend multi-tenant unificado (lhg-api) — acesso via /lhg/{unit}/api/...
// Permite rodar old×new lado a lado no MESMO host (paridade + validação do frontend).
app.use(
  "/lhg",
  createProxyMiddleware({
    target: "http://localhost:3010",
    changeOrigin: true,
    pathRewrite: { "^/lhg": "" },
  })
);

// ============================================================================
// MODO CUTOVER (LHG_CUTOVER=1): as rotas das unidades passam a ser servidas
// pelo lhg-api (multi-tenant), preservando os paths que o frontend já usa:
//   /{unit}/{prefixo_interno}/api/...  →  lhg-api /{unit}/api/...
// Os backends antigos não são iniciados (ver ecosystem.config.js).
// É o mecanismo da Fase 4 — no staging serve de ensaio geral no plano Free.
// ============================================================================
const CUTOVER = process.env.LHG_CUTOVER === "1";
const UNIT_PREFIXES = {
  lush_ipiranga: "ipiranga",
  lush_lapa: "lapa",
  tout: "tout",
  andar_de_cima: "andar_de_cima",
  liv: "liv",
  altana: "altana",
};

if (CUTOVER) {
  console.log("⚡ MODO CUTOVER ativo: unidades servidas pelo lhg-api (:3010)");
  for (const [unit, prefix] of Object.entries(UNIT_PREFIXES)) {
    // O http-proxy-middleware recebe a URL já SEM o prefixo do mount (/{unit}),
    // então o rewrite converte /{prefixo_interno}/api/... → /{unit}/api/...
    app.use(
      `/${unit}`,
      createProxyMiddleware({
        target: "http://localhost:3010",
        changeOrigin: true,
        pathRewrite: { [`^/${prefix}/api`]: `/${unit}/api` },
      })
    );
  }
}

// Rotas para os backends antigos por unidade (ignoradas no modo cutover,
// pois o app.use das unidades acima intercepta antes)
app.use(
  "/lush_ipiranga",
  createProxyMiddleware({ target: "http://localhost:3001", changeOrigin: true })
);
app.use(
  "/lush_lapa",
  createProxyMiddleware({ target: "http://localhost:3002", changeOrigin: true })
);
app.use(
  "/tout",
  createProxyMiddleware({ target: "http://localhost:3003", changeOrigin: true })
);
app.use(
  "/andar_de_cima",
  createProxyMiddleware({ target: "http://localhost:3004", changeOrigin: true })
);
app.use(
  "/liv",
  createProxyMiddleware({ target: "http://localhost:3006", changeOrigin: true })
);
app.use(
  "/altana",
  createProxyMiddleware({ target: "http://localhost:3007", changeOrigin: true })
);

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Proxy rodando na porta ${port}`);
});
