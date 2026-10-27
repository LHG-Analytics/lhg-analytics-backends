-- AlterEnum: LIV está no schema e no DTO, mas nenhuma migration anterior o
-- criava. O banco de produção já tem o valor (havia sido criado à mão), e um
-- banco montado só pelas migrations não tinha. IF NOT EXISTS = idempotente.
ALTER TYPE "UserUnit" ADD VALUE IF NOT EXISTS 'LIV';
