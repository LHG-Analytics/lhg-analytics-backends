const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Proxy para o backend do Lush Ipiranga
app.use('/lush_ipiranga', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: {
    '^/lush_ipiranga': '',
  },
}));

// Proxy para o backend do Lush Lapa
app.use('/lush_lapa', createProxyMiddleware({
  target: 'http://localhost:3002',
  changeOrigin: true,
  pathRewrite: {
    '^/lush_lapa': '',
  },
}));

// Certifique-se de que o proxy está escutando na porta correta
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Proxy rodando na porta ${port}`);
});
