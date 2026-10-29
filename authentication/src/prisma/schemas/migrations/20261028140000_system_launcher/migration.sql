-- Etapa 1c-C2 (só ACRESCENTA): dados do launcher do HUB no catálogo.
ALTER TABLE "System" ADD COLUMN     "description" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "launchUrl" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- Só https e sem credenciais na URL (a aplicação também filtra).
ALTER TABLE "System" ADD CONSTRAINT "System_launchUrl_https"
    CHECK ("launchUrl" IS NULL OR "launchUrl" ~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$');

-- Nomes, textos, ícones e ordem do launcher. As launchUrl ficam NULAS: cada
-- uma nasce quando o sistema é integrado ao HUB, e é preenchida por ambiente.
UPDATE "System" SET "name" = 'LHG Analytics', "description" = 'Indicadores e relatórios das unidades', "icon" = 'chart',    "order" = 1 WHERE "key" = 'analytics';
UPDATE "System" SET "name" = 'LHG RM',        "description" = 'Gestão de receita e tarifas',           "icon" = 'tag',      "order" = 2 WHERE "key" = 'rm';
UPDATE "System" SET "name" = 'LHG Supplies',  "description" = 'Compras, cotações e estoque',           "icon" = 'box',      "order" = 3 WHERE "key" = 'supplies';
UPDATE "System" SET "name" = 'LHG CMS',       "description" = 'Páginas e campanhas das marcas',        "icon" = 'layout',   "order" = 4 WHERE "key" = 'cms';
UPDATE "System" SET "name" = 'Chat LHG',      "description" = 'Atendimento aos clientes',              "icon" = 'chat',     "order" = 5 WHERE "key" = 'chat-lhg';
UPDATE "System" SET "name" = 'Help Desk',     "description" = 'Suporte e chamados internos',           "icon" = 'lifebuoy', "order" = 6 WHERE "key" = 'helpdesk';

-- Conferência: os 6 sistemas do catálogo receberam os dados.
DO $$
DECLARE
    faltando integer;
BEGIN
    SELECT count(*) INTO faltando FROM "System"
        WHERE "key" IN ('analytics', 'rm', 'supplies', 'cms', 'chat-lhg', 'helpdesk')
          AND ("description" IS NULL OR "icon" IS NULL OR "order" = 0);
    IF faltando > 0 OR (SELECT count(*) FROM "System") < 6 THEN
        RAISE EXCEPTION '1c-C2: catálogo incompleto (% sistema(s) sem dados do launcher)', faltando;
    END IF;
END $$;
