-- Etapa 1b (fase EXPAND): pessoas, sistemas e flags de acesso.
-- Só ACRESCENTA: o código atual continua funcionando com este schema (as
-- tabelas filhas apagam em cascata com a pessoa; e-mails são normalizados por
-- trigger em vez de recusados). Ordem:
--   1. trava de e-mails duplicados (antes de qualquer alteração);
--   2. DDL (gerado pelo prisma migrate diff);
--   3. normalização dos e-mails existentes + trigger/CHECK de normalização;
--   4. 1 acesso ATIVO por (pessoa, sistema) e unicidade de e-mail entre
--      "User" e "UserEmail";
--   5. backfill (catálogo de sistemas + flag do Analytics para cada pessoa);
--   6. conferência final.
-- Tudo roda numa transação só: se algum passo falhar, nada fica aplicado.

-- 1. Trava: e-mails que só diferem por maiúsculas/espaços. Só a contagem sai
--    na mensagem (nunca os e-mails). Resolver os casos antes de migrar.
DO $$
DECLARE
    grupos integer;
BEGIN
    SELECT count(*) INTO grupos
    FROM (
        SELECT lower(btrim(email))
        FROM "User"
        GROUP BY 1
        HAVING count(*) > 1
    ) AS duplicados;
    IF grupos > 0 THEN
        RAISE EXCEPTION '1b: % grupo(s) de e-mails em "User" diferem só por maiúsculas/espaços; resolva antes de migrar', grupos;
    END IF;
END $$;

-- 2. DDL
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'INACTIVE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" INTEGER,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "password" DROP NOT NULL,
ALTER COLUMN "cpf" DROP NOT NULL,
ALTER COLUMN "role" DROP NOT NULL,
ALTER COLUMN "unit" DROP NOT NULL;

-- CreateTable
CREATE TABLE "System" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "System_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SystemAccess" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "systemKey" TEXT NOT NULL,
    "grantedById" INTEGER,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedById" INTEGER,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SystemAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAccount" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "systemKey" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEmail" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUnitAccess" (
    "userId" INTEGER NOT NULL,
    "unit" "UserUnit" NOT NULL,

    CONSTRAINT "UserUnitAccess_pkey" PRIMARY KEY ("userId","unit")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" INTEGER,
    "action" TEXT NOT NULL,
    "targetUserId" INTEGER,
    "systemKey" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemAccess_userId_idx" ON "SystemAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemAccount_systemKey_externalId_key" ON "SystemAccount"("systemKey", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemAccount_userId_systemKey_key" ON "SystemAccount"("userId", "systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmail_email_key" ON "UserEmail"("email");

-- CreateIndex
CREATE INDEX "UserEmail_userId_idx" ON "UserEmail"("userId");

-- CreateIndex
CREATE INDEX "AuditEvent_targetUserId_at_idx" ON "AuditEvent"("targetUserId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_action_at_idx" ON "AuditEvent"("action", "at");

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccess" ADD CONSTRAINT "SystemAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccess" ADD CONSTRAINT "SystemAccess_systemKey_fkey" FOREIGN KEY ("systemKey") REFERENCES "System"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccess" ADD CONSTRAINT "SystemAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccess" ADD CONSTRAINT "SystemAccess_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccount" ADD CONSTRAINT "SystemAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccount" ADD CONSTRAINT "SystemAccount_systemKey_fkey" FOREIGN KEY ("systemKey") REFERENCES "System"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmail" ADD CONSTRAINT "UserEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUnitAccess" ADD CONSTRAINT "UserUnitAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_systemKey_fkey" FOREIGN KEY ("systemKey") REFERENCES "System"("key") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 3. Normalização de e-mail: minúsculas e sem espaços nas pontas.
UPDATE "User" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));

-- O trigger grava sempre normalizado (o código antigo, que não normaliza,
-- nunca recebe erro por maiúsculas). Os triggers de uma tabela disparam em
-- ordem alfabética: "a_" (normaliza) roda antes de "b_" (unicidade), e o
-- CHECK, redundante, é avaliado depois dos triggers BEFORE.
CREATE FUNCTION "lhg_normalize_email"() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
    NEW."email" := lower(btrim(NEW."email"));
    RETURN NEW;
END $$;

CREATE TRIGGER "a_normalize_email" BEFORE INSERT OR UPDATE OF "email" ON "User"
    FOR EACH ROW EXECUTE FUNCTION "lhg_normalize_email"();
CREATE TRIGGER "a_normalize_email" BEFORE INSERT OR UPDATE OF "email" ON "UserEmail"
    FOR EACH ROW EXECUTE FUNCTION "lhg_normalize_email"();

ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "UserEmail" ADD CONSTRAINT "UserEmail_email_normalized" CHECK ("email" = lower(btrim("email")));

-- 4a. No máximo 1 acesso ATIVO por (pessoa, sistema); revogados ficam no
--     histórico. O Prisma não modela índice parcial.
CREATE UNIQUE INDEX "SystemAccess_active_key" ON "SystemAccess"("userId", "systemKey") WHERE "revokedAt" IS NULL;

-- 4b. Um e-mail pertence a UMA pessoa só, somando "User".email (principal) e
--     "UserEmail".email (secundários). O @unique cobre cada tabela; entre as
--     duas, estes triggers. O advisory lock por e-mail serializa gravações
--     simultâneas do mesmo endereço nas duas tabelas (sem ele, duas
--     transações concorrentes poderiam passar pela conferência ao mesmo tempo).
--     O erro sai como RAISE comum (P0001) com o prefixo EMAIL_IN_USE: assim a
--     mensagem chega à aplicação (como unique_violation o Prisma a descarta).
CREATE FUNCTION "lhg_user_email_not_secondary"() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."email", 0));
    IF EXISTS (SELECT 1 FROM "UserEmail" WHERE "email" = NEW."email") THEN
        RAISE EXCEPTION 'EMAIL_IN_USE: e-mail já é secundário de outra pessoa';
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION "lhg_secondary_email_not_primary"() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."email", 0));
    IF EXISTS (SELECT 1 FROM "User" WHERE "email" = NEW."email") THEN
        RAISE EXCEPTION 'EMAIL_IN_USE: e-mail já é o principal de uma pessoa';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER "b_email_unique" BEFORE INSERT OR UPDATE OF "email" ON "User"
    FOR EACH ROW EXECUTE FUNCTION "lhg_user_email_not_secondary"();
CREATE TRIGGER "b_email_unique" BEFORE INSERT OR UPDATE OF "email" ON "UserEmail"
    FOR EACH ROW EXECUTE FUNCTION "lhg_secondary_email_not_primary"();

-- 5. Backfill. "status" (ACTIVE) e "publicId" já vieram pelos DEFAULTs do
--    ADD COLUMN, linha a linha.
INSERT INTO "System" ("key", "name") VALUES
    ('analytics', 'LHG Analytics'),
    ('cms', 'CMS'),
    ('rm', 'RM'),
    ('supplies', 'Supplies'),
    ('chat-lhg', 'Chat LHG'),
    ('helpdesk', 'LHG Help Desk');

-- Quem já existe tem acesso ao Analytics desde o próprio cadastro.
INSERT INTO "SystemAccess" ("userId", "systemKey", "grantedAt")
SELECT "id", 'analytics', "createdAt" FROM "User";

-- 6. Conferência: toda pessoa existente ficou com a flag do Analytics ativa.
DO $$
DECLARE
    pessoas integer;
    flags integer;
BEGIN
    SELECT count(*) INTO pessoas FROM "User";
    SELECT count(*) INTO flags FROM "SystemAccess"
        WHERE "systemKey" = 'analytics' AND "revokedAt" IS NULL;
    IF pessoas <> flags THEN
        RAISE EXCEPTION '1b: conferência falhou: % pessoa(s) e % acesso(s) ativos ao analytics', pessoas, flags;
    END IF;
END $$;
