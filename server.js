const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// Encaminha as requisições para o backend correto
app.use("/ipiranga/api", createProxyMiddleware({ target: "http://localhost:3001", changeOrigin: true }));
app.use("/lapa/api", createProxyMiddleware({ target: "http://localhost:3002", changeOrigin: true }));

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Proxy rodando na porta ${PORT}`));
