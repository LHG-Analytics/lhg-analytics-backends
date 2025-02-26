module.exports = {
    apps: [
      {
        name: "proxy",
        script: "./server.js", // Proxy reverso para direcionar chamadas
        env: {
          PORT: process.env.PORT || 3000, // A porta que o Render vai expor
        },
      },
      {
        name: "lush_ipiranga",
        script: "./lush_ipiranga/dist/main.js",
        env: {
          NODE_ENV: "production",
          DATABASE_URL_LOCAL_IPIRANGA: process.env.DATABASE_URL_LOCAL_IPIRANGA,
          DATABASE_URL_ONLINE_IPIRANGA: process.env.DATABASE_URL_ONLINE_IPIRANGA,
          SERVICE_PREFIX: "ipiranga", // Prefixo para diferenciação
        },
      },
      {
        name: "lush_lapa",
        script: "./lush_lapa/dist/main.js",
        env: {
          NODE_ENV: "production",
          DATABASE_URL_LOCAL_LAPA: process.env.DATABASE_URL_LOCAL_LAPA,
          DATABASE_URL_ONLINE_LAPA: process.env.DATABASE_URL_ONLINE_LAPA,
          SERVICE_PREFIX: "lapa", // Prefixo para diferenciação
        },
      },
    ],
    post_deploy: [
      "npm install --legacy-peer-deps",
      "npm install -g pm2", // Certifique-se de que o pm2 esteja instalado globalmente
    ],
  };
  