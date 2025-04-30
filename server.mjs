import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

// Apenas o /auth precisa manter o prefixo no destino
app.use(
  "/auth",
  createProxyMiddleware({
    target: "http://localhost:3005",
    changeOrigin: true,
    secure: false,
    logLevel: "debug",
    pathRewrite: {
      "^/auth": "/auth", // mantém o prefixo no destino
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(
        `🔄 Proxy encaminhando requisição para: http://localhost:3005${req.originalUrl}`
      );
      console.log("Headers recebidos no Proxy:", req.headers);
      if (req.headers["authorization"]) {
        proxyReq.setHeader("Authorization", req.headers["authorization"]);
      }
    },
  })
);

// As outras rotas continuam como estão, sem alteração de pathRewrite
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
