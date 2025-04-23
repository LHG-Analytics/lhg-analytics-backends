module.exports = {
  apps: [
    {
      name: "proxy",
      script: "./server.mjs",
      env: {
        PORT: 3000, // Proxy sempre na porta 3000
      },
      env_production: {
        PORT: 3000, // Proxy sempre na porta 3000
      },
    },
    {
      name: "lush_ipiranga",
      script: "./lush_ipiranga/dist/main.js",
      env: {
        NODE_ENV: "production",
        DATABASE_URL_LOCAL_IPIRANGA: process.env.DATABASE_URL_LOCAL_IPIRANGA,
        DATABASE_URL_ONLINE_IPIRANGA: process.env.DATABASE_URL_ONLINE_IPIRANGA,
        SERVICE_PREFIX: "ipiranga",
        PORT: 3001, // Rodando localmente
      },
      env_production: {
        PORT: 3001, // Rodando localmente
      },
    },
    {
      name: "lush_lapa",
      script: "./lush_lapa/dist/main.js",
      env: {
        NODE_ENV: "production",
        DATABASE_URL_LOCAL_LAPA: process.env.DATABASE_URL_LOCAL_LAPA,
        DATABASE_URL_ONLINE_LAPA: process.env.DATABASE_URL_ONLINE_LAPA,
        SERVICE_PREFIX: "lapa",
        PORT: 3002, // Rodando localmente
      },
      env_production: {
        PORT: 3002, // Rodando localmente
      },
    },
    {
      name: "tout",
      script: "./tout/dist/main.js",
      env: {
        NODE_ENV: "production",
        DATABASE_URL_LOCAL_TOUT: process.env.DATABASE_URL_LOCAL_TOUT,
        DATABASE_URL_ONLINE_TOUT: process.env.DATABASE_URL_ONLINE_TOUT,
        SERVICE_PREFIX: "tout",
        PORT: 3003, // Rodando localmente
      },
      env_production: {
        PORT: 3003, // Rodando localmente
      },
    },
    {
      name: "andar_de_cima",
      script: "./andar_de_cima/dist/main.js",
      env: {
        NODE_ENV: "production",
        DATABASE_URL_LOCAL_ANDAR_DE_CIMA:
          process.env.DATABASE_URL_LOCAL_ANDAR_DE_CIMA,
        DATABASE_URL_ONLINE_ANDAR_DE_CIMA:
          process.env.DATABASE_URL_ONLINE_ANDAR_DE_CIMA,
        SERVICE_PREFIX: "andar_de_cima",
        PORT: 3004, // Rodando localmente
      },
      env_production: {
        PORT: 3004, // Rodando localmente
      },
    },
  ],
  post_deploy: ["npm install --legacy-peer-deps", "npm install -g pm2"],
};
