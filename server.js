const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Proxy para o backend do Lush Ipiranga
app.use('/lush_ipiranga', createProxyMiddleware({
    target: 'http://localhost:3001', // Alterado para localhost
    changeOrigin: true,
}));

// Proxy para o backend do Lush Lapa
app.use('/lush_lapa', createProxyMiddleware({
    target: 'http://localhost:3002', // Alterado para localhost
    changeOrigin: true,
}));

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Proxy rodando na porta ${port}`);
});
