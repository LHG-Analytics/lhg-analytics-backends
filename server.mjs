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
// No cutover (Fase 4), as rotas das unidades abaixo passam a apontar para ele.
app.use(
  "/lhg",
  createProxyMiddleware({
    target: "http://localhost:3010",
    changeOrigin: true,
    pathRewrite: { "^/lhg": "" },
  })
);

// As outras unidades permanecem inalteradas
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
