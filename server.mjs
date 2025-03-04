import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

// Função para configuração do proxy
const proxyConfig = (target) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    logLevel: "debug", // Logs detalhados no terminal
    onProxyReq: (proxyReq, req, res) => {
      console.log(
        `🔄 Proxy encaminhando requisição para: ${target}${req.originalUrl}`
      );
      console.log("Headers recebidos no Proxy:", req.headers);
      if (req.headers["authorization"]) {
        proxyReq.setHeader("Authorization", req.headers["authorization"]);
      }
    },
  });

// Configuração do proxy para o Lush Ipiranga
app.use(
  "/lush_ipiranga",
  proxyConfig("https://lhg-analytics-backend-bmmd.onrender.com")
);

// Configuração do proxy para o Lush Lapa
app.use(
  "/lush_lapa",
  proxyConfig("https://lhg-analytics-backend-bmmd.onrender.com")
);

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Proxy rodando na porta ${port}`);
});
