const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Proxy para o backend do Lush Ipiranga
app.use('/lush_ipiranga', createProxyMiddleware({
  target: 'https://lhg-analytics-backend-bmmd.onrender.com/lush_ipiranga',
  changeOrigin: true,
  pathRewrite: {
    '^/lush_ipiranga': '',
  },
}));

// Proxy para o backend do Lush Lapa
app.use('/lush_lapa', createProxyMiddleware({
  target: 'https://lhg-analytics-backend-bmmd.onrender.com/lush_lapa',
  changeOrigin: true,
  pathRewrite: {
    '^/lush_lapa': '',
  },
}));

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Proxy rodando na porta ${port}`);
});

