import "module-alias/register.js";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

// ============================================================================
// Topologia pós-migração multi-tenant (2026-07-25) — entrypoint público.
//   /auth/api/{Company|Bookings|Restaurant|Governance}/*  → lhg-api Consolidated (:3010)
//   /auth/api/*  (login/refresh/logout/me/users)          → authentication (:3005)
//   /lhg/*       (rota canônica nova: /lhg/{unit}/api/...) → lhg-api (:3010)
//   /{unit}/{prefixo}/api/*  (compat com paths ANTIGOS)   → lhg-api (:3010)
// ============================================================================

// Consolidated: os KPIs consolidados migraram do authentication para o lhg-api.
// Este interceptor (registrado ANTES do /auth genérico) manda só os KPIs para o
// lhg-api; login/refresh/logout/me/users continuam no serviço de autenticação.
const CONSOLIDATED_KPIS = /^\/(Company|Bookings|Restaurant|Governance)\//;
app.use(
  "/auth/api",
  createProxyMiddleware({
    changeOrigin: true,
    router: (req) =>
      CONSOLIDATED_KPIS.test(req.url)
        ? "http://localhost:3010"
        : "http://localhost:3005",
    pathRewrite: (path) =>
      CONSOLIDATED_KPIS.test(path) ? `/api/consolidated${path}` : `/api${path}`,
  })
);

// Auth genérico — remove "/auth" antes de enviar ao Nest (que escuta em /api).
app.use(
  "/auth",
  createProxyMiddleware({
    target: "http://localhost:3005",
    changeOrigin: true,
    secure: false,
    pathRewrite: {
      "^/auth": "", // remove "/auth" da URL
    },
    onProxyReq: (proxyReq, req) => {
      if (req.headers["authorization"]) {
        proxyReq.setHeader("Authorization", req.headers["authorization"]);
      }
    },
  })
);

// Rota canônica nova do backend multi-tenant (lhg-api): /lhg/{unit}/api/...
app.use(
  "/lhg",
  createProxyMiddleware({
    target: "http://localhost:3010",
    changeOrigin: true,
    pathRewrite: { "^/lhg": "" },
  })
);

// ============================================================================
// COMPAT: preserva os paths ANTIGOS do frontend (/{unit}/{prefixo}/api/...),
// reescrevendo para o padrão do lhg-api (/{unit}/api/...). Rede de segurança
// enquanto o frontend não estiver 100% no formato novo (/lhg/...). Quando essa
// migração se confirmar, este bloco pode ser removido.
// OBS: o http-proxy-middleware recebe a URL já SEM o prefixo do mount (/{unit}),
// então o rewrite opera sobre /{prefixo}/api/...
// ============================================================================
const UNIT_PREFIXES = {
  lush_ipiranga: "ipiranga",
  lush_lapa: "lapa",
  tout: "tout",
  andar_de_cima: "andar_de_cima",
  liv: "liv",
  altana: "altana",
};
for (const [unit, prefix] of Object.entries(UNIT_PREFIXES)) {
  app.use(
    `/${unit}`,
    createProxyMiddleware({
      target: "http://localhost:3010",
      changeOrigin: true,
      pathRewrite: { [`^/${prefix}/api`]: `/${unit}/api` },
    })
  );
}

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Proxy rodando na porta ${port}`);
});
