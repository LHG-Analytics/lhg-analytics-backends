const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// Configurar proxy reverso para os serviços
const targets = {
  "/ipiranga/api": "http://localhost:3001",
  "/lapa/api": "http://localhost:3002",
};

// Criar um proxy para cada serviço
Object.keys(targets).forEach((context) => {
  app.use(
    context,
    createProxyMiddleware({
      target: targets[context],
      changeOrigin: true,
    })
  );
});

// Definir a porta do proxy
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy rodando na porta ${PORT}`);
});
