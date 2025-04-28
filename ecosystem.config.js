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
      name: "auth",
      script: "./dist/auth/main.js", // Caminho correto para o build de auth
      env: {
        NODE_ENV: "production",
        SUPABASE_URL_USERS: process.env.SUPABASE_URL_USERS,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRATION_TIME: process.env.JWT_EXPIRATION_TIME,
        PORT_AUTH: 3005, // Porta do serviço de auth
      },
      env_production: {
        PORT_AUTH: 3005, // Porta do serviço de auth
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
  post_deploy: [
    "npm install --legacy-peer-deps",
    "npm install -g pm2", // Instala o PM2 globalmente
    "npm run build", // Executa o build para garantir que todos os builds estejam prontos
  ],
};
