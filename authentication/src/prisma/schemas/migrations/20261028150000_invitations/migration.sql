-- Etapa 1c-C3 (só ACRESCENTA): convites de uso único.
-- O token do link NUNCA é guardado: só o SHA-256 dele (tokenHash).
CREATE TABLE "Invitation" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "systems" TEXT[] NOT NULL DEFAULT '{}',
    "role" "UserRole",
    "unit" "UserUnit",
    "invitedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "neverReason" TEXT,
    "tokenHash" TEXT NOT NULL,
    "linkCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" INTEGER,
    "acceptedMethod" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" INTEGER,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"),
    -- Mesma forma canônica do User.email.
    CONSTRAINT "Invitation_email_normalized" CHECK ("email" = lower(btrim("email"))),
    CONSTRAINT "Invitation_tokenHash_sha256" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "Invitation_acceptedMethod_check" CHECK ("acceptedMethod" IS NULL OR "acceptedMethod" IN ('password', 'google')),
    -- "Nunca expira" exige o motivo registrado.
    CONSTRAINT "Invitation_never_reason" CHECK ("expiresAt" IS NOT NULL OR "neverReason" IS NOT NULL),
    -- Aceito = com pessoa e método; e nunca aceito E revogado ao mesmo tempo.
    CONSTRAINT "Invitation_accepted_consistent" CHECK (("acceptedAt" IS NULL) = ("acceptedMethod" IS NULL)),
    CONSTRAINT "Invitation_accepted_or_revoked" CHECK ("acceptedAt" IS NULL OR "revokedAt" IS NULL)
);

CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- No máximo 1 convite PENDENTE (não aceito e não revogado) por e-mail. Um
-- convite vencido é revogado pela aplicação antes de criar o novo.
CREATE UNIQUE INDEX "Invitation_pending_email_key" ON "Invitation"("email")
    WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
