-- Etapa 1c-C4 (só ACRESCENTA): vínculo com a conta Google.
ALTER TABLE "User" ADD COLUMN     "googleAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "googleLinkedAt" TIMESTAMP(3),
ADD COLUMN     "googleSub" TEXT;

-- Uma conta Google vincula UMA pessoa só.
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- Vinculado = sub e data juntos.
ALTER TABLE "User" ADD CONSTRAINT "User_google_link_consistent"
    CHECK (("googleSub" IS NULL) = ("googleLinkedAt" IS NULL));
