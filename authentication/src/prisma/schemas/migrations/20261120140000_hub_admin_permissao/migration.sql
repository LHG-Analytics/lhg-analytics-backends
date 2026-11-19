-- "Admin do HUB" (só ACRESCENTA): a permissão 'hub-admin', uma flag em
-- SystemAccess que NÃO é sistema (sem cartão: launchUrl nula; fora do convite
-- e da API legada; a lista fixa fica no código, access/permissoes.ts).
-- Ninguém recebe a permissão aqui: a concessão inicial é por script, por
-- e-mail e por ambiente (os ids diferem entre homologação e produção).
INSERT INTO "System" ("key", "name", "active", "launchUrl", "icon", "description", "order")
VALUES ('hub-admin', 'Admin do HUB', true, NULL, 'shield',
        'Permissão: administrar pessoas e convites no HUB', 99)
ON CONFLICT ("key") DO NOTHING;
