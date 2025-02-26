module.exports = {
    apps: [
      {
        name: "proxy",
        script: "./server.js", // Proxy reverso para direcionar chamadas
        env: {
          PORT: 3000, // Única porta exposta no Render
        },
      },
      {
        name: "lush_ipiranga",
        script: "./lush_ipiranga/dist/main.js",
        env: {
          NODE_ENV: "production",
          DATABASE_URL_LOCAL_IPIRANGA: process.env.DATABASE_URL_LOCAL_IPIRANGA,
          DATABASE_URL_ONLINE_IPIRANGA: process.env.DATABASE_URL_ONLINE_IPIRANGA,
          SERVICE_PREFIX: "ipiranga", // Definir um prefixo para diferenciação
        },
      },
      {
        name: "lush_lapa",
        script: "./lush_lapa/dist/main.js",
        env: {
          NODE_ENV: "production",
          DATABASE_URL_LOCAL_LAPA: process.env.DATABASE_URL_LOCAL_LAPA,
          DATABASE_URL_ONLINE_LAPA: process.env.DATABASE_URL_ONLINE_LAPA,
          SERVICE_PREFIX: "lapa", // Definir um prefixo para diferenciação
        },
      },
    ],
    post_deploy: [
      "npm install --legacy-peer-deps",
      "npm install -g pm2",
    ],
  };
  