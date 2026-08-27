-- AlterEnum: adiciona a unidade Getan Independência (3ª unidade GETAN/Goiânia),
-- alinhado ao DTO / JWT / tenant registry do lhg-api.
-- Executar uma vez no banco do Supabase (users), em prod e em dev.
-- Supabase é PG 15+, então ADD VALUE IF NOT EXISTS é seguro e idempotente.
ALTER TYPE "UserUnit" ADD VALUE IF NOT EXISTS 'GETAN_INDEPENDENCIA';
