-- Etapa 1c-C1 (só ACRESCENTA): origem do cadastro e bloqueio por tentativas.
-- O código atual funciona com estas colunas (todas com DEFAULT ou nulas).

ALTER TABLE "User" ADD COLUMN     "createdVia" TEXT NOT NULL DEFAULT 'admin',
ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failedLoginFirstAt" TIMESTAMP(3),
ADD COLUMN     "lockLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- Quem já existe nasceu antes da 1c.
UPDATE "User" SET "createdVia" = 'backfill';

ALTER TABLE "User" ADD CONSTRAINT "User_createdVia_check"
    CHECK ("createdVia" IN ('admin', 'invite_password', 'invite_google', 'migration', 'backfill'));
