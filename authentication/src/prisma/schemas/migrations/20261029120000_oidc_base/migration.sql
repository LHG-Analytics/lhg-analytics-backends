-- Etapa 1d-D1 (só ACRESCENTA): base do provedor OIDC. Ainda sem login.

-- Estado do oidc-provider (adapter Prisma): um registro por (tipo, id).
CREATE TABLE "OidcPayload" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "grantId" TEXT,
    "uid" TEXT,
    "accountId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "OidcPayload_pkey" PRIMARY KEY ("id","type")
);

-- Clientes OIDC. SEM segredo no banco (vem de OIDC_CLIENT_SECRET_<CLIENTE>).
CREATE TABLE "OidcClient" (
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemKey" TEXT,
    "redirectUris" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "postLogoutRedirectUris" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "backchannelLogoutUri" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OidcClient_pkey" PRIMARY KEY ("clientId"),
    -- Vira o sufixo da variável do segredo: só minúsculas, dígitos e hífen.
    CONSTRAINT "OidcClient_clientId_format" CHECK ("clientId" ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
    CONSTRAINT "OidcClient_backchannel_https" CHECK ("backchannelLogoutUri" IS NULL OR "backchannelLogoutUri" ~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$')
);

-- Fila de avisos de logout (back-channel). lastErrorCode = só o código HTTP
-- ou o tipo do erro, NUNCA o corpo da resposta.
CREATE TABLE "Outbox" (
    "id" BIGSERIAL NOT NULL,
    "clientId" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "sid" TEXT,
    "event" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Outbox_status_check" CHECK ("status" IN ('pending', 'sent', 'failed')),
    CONSTRAINT "Outbox_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "OidcPayload_grantId_idx" ON "OidcPayload"("grantId");
CREATE INDEX "OidcPayload_uid_idx" ON "OidcPayload"("uid");
CREATE INDEX "OidcPayload_accountId_idx" ON "OidcPayload"("accountId");
CREATE INDEX "OidcPayload_expiresAt_idx" ON "OidcPayload"("expiresAt");
CREATE INDEX "Outbox_status_nextAttemptAt_idx" ON "Outbox"("status", "nextAttemptAt");

ALTER TABLE "OidcClient" ADD CONSTRAINT "OidcClient_systemKey_fkey" FOREIGN KEY ("systemKey") REFERENCES "System"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Outbox" ADD CONSTRAINT "Outbox_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OidcClient"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
