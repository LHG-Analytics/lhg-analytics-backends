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

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Proxy rodando na porta ${port}`);
});
