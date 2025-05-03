import "module-alias/register";

module.exports = {
  apps: [
    {
      name: "proxy",
      script: "./server.mjs",
      node_args: "-r module-alias/register",
      env: {
        PORT: 3000,
      },
      env_production: {
        PORT: 3000,
      },
    },
    {
      name: "auth",
      script: "./authentication/dist/main.js",
      env: {
        NODE_ENV: "production",
        SUPABASE_URL_USERS: process.env.SUPABASE_URL_USERS,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRATION_TIME: process.env.JWT_EXPIRATION_TIME,
        PORT_AUTH: 3005,
      },
      env_production: {
        PORT_AUTH: 3005,
      },
    },
    {
      name: "lush_ipiranga",
      script: "./lush_ipiranga/dist/main.js",
      node_args: "-r module-alias/register",
      env: {
        NODE_ENV: "production",
        DATABASE_URL_LOCAL_IPIRANGA: process.env.DATABASE_URL_LOCAL_IPIRANGA,
        DATABASE_URL_ONLINE_IPIRANGA: process.env.DATABASE_URL_ONLINE_IPIRANGA,
        SERVICE_PREFIX: "ipiranga",
        PORT: 3001,
      },
      env_production: {
        PORT: 3001,
      },
    },
    {
      name: "lush_lapa",
      script: "./lush_lapa/dist/main.js",
      node_args: "-r module-alias/register",
      env: {
        NODE_ENV: "production",
        DATABASE_URL_LOCAL_LAPA: process.env.DATABASE_URL_LOCAL_LAPA,
        DATABASE_URL_ONLINE_LAPA: process.env.DATABASE_URL_ONLINE_LAPA,
        SERVICE_PREFIX: "lapa",
        PORT: 3002,
      },
      env_production: {
        PORT: 3002,
      },
    },
    {
      name: "tout",
      script: "./tout/dist/main.js",
      node_args: "-r module-alias/register",
      env: {
        NODE_ENV: "production",
        DATABASE_URL_LOCAL_TOUT: process.env.DATABASE_URL_LOCAL_TOUT,
        DATABASE_URL_ONLINE_TOUT: process.env.DATABASE_URL_ONLINE_TOUT,
        SERVICE_PREFIX: "tout",
        PORT: 3003,
      },
      env_production: {
        PORT: 3003,
      },
    },
    {
      name: "andar_de_cima",
      script: "./andar_de_cima/dist/main.js",
      node_args: "-r module-alias/register",
      env: {
        NODE_ENV: "production",
        DATABASE_URL_LOCAL_ANDAR_DE_CIMA:
          process.env.DATABASE_URL_LOCAL_ANDAR_DE_CIMA,
        DATABASE_URL_ONLINE_ANDAR_DE_CIMA:
          process.env.DATABASE_URL_ONLINE_ANDAR_DE_CIMA,
        SERVICE_PREFIX: "andar_de_cima",
        PORT: 3004,
      },
      env_production: {
        PORT: 3004,
      },
    },
  ],
  deploy: {
    production: {
      post_deploy: "npm install && npm run build",
    },
  },
};
