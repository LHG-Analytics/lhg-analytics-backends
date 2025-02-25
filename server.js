const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// Atualize as URLs de destino para os backends no Render
app.use("/ipiranga/api", createProxyMiddleware({ 
  target: "https://lhg-analytics-backend-bmmd.onrender.com", 
  changeOrigin: true,
  pathRewrite: {
    '^/ipiranga/api': '/api', // Reescreve o caminho para o backend
  }
}));

app.use("/lapa/api", createProxyMiddleware({ 
  target: "https://lhg-analytics-backend-bmmd.onrender.com", 
  changeOrigin: true,
  pathRewrite: {
    '^/lapa/api': '/api', // Reescreve o caminho para o backend
  }
}));

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Proxy rodando na porta ${PORT}`));
