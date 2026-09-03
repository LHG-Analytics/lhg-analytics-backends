require("module-alias/register");

// ============================================================================
// Topologia pós-migração multi-tenant (2026-07-25): 3 processos.
//   proxy   — server.mjs (entrypoint público, porta $PORT)
//   lhg-api — backend multi-tenant: todas as unidades + Consolidated (:3010)
//   auth    — authentication: login/refresh/logout/me/users (:3005)
// Os 6 backends por unidade foram aposentados (o lhg-api os substitui).
// ============================================================================
module.exports = {
  apps: [
    {
      name: "proxy",
      script: "./server.mjs",
      node_args: "-r module-alias/register",
      env: {
        PORT: process.env.PORT || 3000,
      },
      env_production: {
        PORT: process.env.PORT || 3000,
      },
    },
    {
      // Backend multi-tenant unificado — serve /lhg/{unit}/api/... e o Consolidated.
      name: "lhg-api",
      script: "./lhg-api/dist/main.js",
      env: {
        NODE_ENV: "production",
        PORT: 3010, // fixa a porta interna (evita herdar o $PORT do Render, que é do proxy)
        JWT_SECRET: process.env.JWT_SECRET,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
        DATABASE_URL_LOCAL_IPIRANGA: process.env.DATABASE_URL_LOCAL_IPIRANGA,
        DATABASE_URL_LOCAL_LAPA: process.env.DATABASE_URL_LOCAL_LAPA,
        DATABASE_URL_LOCAL_TOUT: process.env.DATABASE_URL_LOCAL_TOUT,
        DATABASE_URL_LOCAL_ANDAR_DE_CIMA: process.env.DATABASE_URL_LOCAL_ANDAR_DE_CIMA,
        DATABASE_URL_LOCAL_LIV: process.env.DATABASE_URL_LOCAL_LIV,
        DATABASE_URL_LOCAL_ALTANA: process.env.DATABASE_URL_LOCAL_ALTANA,
        DATABASE_URL_LOCAL_GETAN_GARAVELO:
          process.env.DATABASE_URL_LOCAL_GETAN_GARAVELO,
        DATABASE_URL_LOCAL_GETAN_PQ_OESTE:
          process.env.DATABASE_URL_LOCAL_GETAN_PQ_OESTE,
        DATABASE_URL_LOCAL_GETAN_INDEPENDENCIA:
          process.env.DATABASE_URL_LOCAL_GETAN_INDEPENDENCIA,
        DATABASE_URL_LOCAL_GETAN_NOVO_MUNDO:
          process.env.DATABASE_URL_LOCAL_GETAN_NOVO_MUNDO,
        DATABASE_URL_LOCAL_GETAN_VERA_CRUZ:
          process.env.DATABASE_URL_LOCAL_GETAN_VERA_CRUZ,
        DATABASE_URL_LOCAL_GETAN_GRID: process.env.DATABASE_URL_LOCAL_GETAN_GRID,
        // Cache Redis (opcional): se ausente, o KpiCacheService usa Map em memória.
        // CACHE_PREFIX separa os ambientes num Redis compartilhado (ex.: prod/dev).
        REDIS_URL: process.env.REDIS_URL,
        CACHE_PREFIX: process.env.CACHE_PREFIX,
        // Auto-warmup no boot (default ligado). WARMUP_ON_BOOT=false desliga.
        WARMUP_ON_BOOT: process.env.WARMUP_ON_BOOT,
        WARMUP_ON_BOOT_DELAY_MS: process.env.WARMUP_ON_BOOT_DELAY_MS,
      },
      env_production: {
        PORT: 3010,
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
  ],
  deploy: {
    production: {
      post_deploy: "npm install && npm run build",
    },
  },
};
