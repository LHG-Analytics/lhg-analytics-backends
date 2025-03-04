import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

const proxyConfig = (target, pathRewrite) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    logLevel: "debug", // <-- Adiciona logs detalhados no terminal
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

app.use(
  "/lush_ipiranga",
  proxyConfig("https://lhg-analytics-backend-bmmd.onrender.com", {
    "^/lush_ipiranga": "",
  })
);
app.use(
  "/lush_lapa",
  proxyConfig("https://lhg-analytics-backend-bmmd.onrender.com", {
    "^/lush_lapa": "",
  })
);

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Proxy rodando na porta ${port}`);
});
