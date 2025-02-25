# Usa uma imagem oficial do Node.js como base
FROM node:18

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copia os arquivos do projeto para dentro do contêiner
COPY . .

# Instala as dependências e compila os projetos
RUN cd lush_ipiranga && npm ci && npm run build
RUN cd lush_lapa && npm ci && npm run build

# Instala o PM2 globalmente
RUN npm install -g pm2

# Expõe as portas que serão utilizadas
EXPOSE 3000 3001

# Comando para iniciar os dois servidores usando PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
