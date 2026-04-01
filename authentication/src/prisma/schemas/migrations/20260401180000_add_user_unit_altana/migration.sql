-- AlterEnum: adiciona unidade Altana (alinhado ao DTO / JWT / UNIT_CONFIGS).
-- Executar uma vez no banco do Supabase (users). Em PG 15+ pode-se usar ADD VALUE IF NOT EXISTS.
ALTER TYPE "UserUnit" ADD VALUE 'ALTANA';
