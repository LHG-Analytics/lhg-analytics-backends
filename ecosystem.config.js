module.exports = {
    apps: [
        {
            name: "lush_ipiranga",
            script: "./lush_ipiranga/dist/main.js",  // Caminho correto para o arquivo main.js
            env: {
                PORT: 3000,
                NODE_ENV: "production",
                DATABASE_URL_LOCAL_IPIRANGA: process.env.DATABASE_URL_LOCAL_IPIRANGA,
                DATABASE_URL_ONLINE_IPIRANGA: process.env.DATABASE_URL_ONLINE_IPIRANGA
            }
        },
        {
            name: "lush_lapa",
            script: "./lush_lapa/dist/main.js",  // Caminho correto para o arquivo main.js
            env: {
                PORT: 3001,
                NODE_ENV: "production",
                DATABASE_URL_LOCAL_LAPA: process.env.DATABASE_URL_LOCAL_LAPA,
                DATABASE_URL_ONLINE_LAPA: process.env.DATABASE_URL_ONLINE_LAPA
            }
        }
    ]
};
