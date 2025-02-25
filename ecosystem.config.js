module.exports = {
    apps: [
      {
        name: "proxy",
        script: "./server.js",
        env: {
          PORT: 3000, // Porta que o Render vai expor
        },
      },
      {
        name: "lush_ipiranga",
        script: "./lush_ipiranga/dist/main.js",  // Caminho correto para o arquivo main.js
        env: {
          PORT: 3001,
          NODE_ENV: "production",
          DATABASE_URL_LOCAL_IPIRANGA: process.env.DATABASE_URL_LOCAL_IPIRANGA,
          DATABASE_URL_ONLINE_IPIRANGA: process.env.DATABASE_URL_ONLINE_IPIRANGA,
        },
      },
      {
        name: "lush_lapa",
        script: "./lush_lapa/dist/main.js",  // Caminho correto para o arquivo main.js
        env: {
          PORT: 3002,
          NODE_ENV: "production",
          DATABASE_URL_LOCAL_LAPA: process.env.DATABASE_URL_LOCAL_LAPA,
          DATABASE_URL_ONLINE_LAPA: process.env.DATABASE_URL_ONLINE_LAPA,
        },
      },
    ],
    post_deploy: [
      // Certificar-se de que o pm2 será instalado globalmente
      "npm install --legacy-peer-deps", // Instalar dependências (caso ainda não tenha feito)
      "npm install -g pm2",  // Instalar o PM2 globalmente
    ],
  };
  