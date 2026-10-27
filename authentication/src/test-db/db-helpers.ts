// Apoio da suíte de banco (npm run test:db). Cada teste usa um schema
// descartável num Postgres de TESTE (TEST_DATABASE_URL): no CI é o service
// container do workflow; localmente, um container qualquer. Nunca aponte para
// um banco real: os schemas são criados e apagados aqui.
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCHEMA_FILE = path.resolve(
  __dirname,
  '../prisma/schemas/schema.online.prisma',
);
const MIGRATIONS_DIR = path.resolve(__dirname, '../prisma/schemas/migrations');
export const MIGRATION_1B = '20261027180000_identity_1b';

export function baseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL não definida: a suíte de banco precisa de um Postgres de teste',
    );
  }
  return url;
}

/** URL de um schema novo e vazio (nome aleatório). */
export function novoSchema(prefixo: string): string {
  const url = new URL(baseUrl());
  const nome = `${prefixo}_${crypto.randomBytes(4).toString('hex')}`;
  url.searchParams.set('schema', nome);
  return url.toString();
}

/**
 * Roda o `prisma migrate deploy` de verdade contra `url`. Com `ate` definido,
 * aplica só as migrations ANTERIORES a ela (para montar um banco "de antes").
 * Devolve { ok, saida } sem lançar, para os testes de falha.
 */
export function migrar(
  url: string,
  ate?: string,
): { ok: boolean; saida: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhg-migr-'));
  try {
    fs.copyFileSync(SCHEMA_FILE, path.join(dir, 'schema.prisma'));
    const destino = path.join(dir, 'migrations');
    fs.mkdirSync(destino);
    for (const item of fs.readdirSync(MIGRATIONS_DIR)) {
      if (ate && item !== 'migration_lock.toml' && item >= ate) continue;
      fs.cpSync(path.join(MIGRATIONS_DIR, item), path.join(destino, item), {
        recursive: true,
      });
    }
    const cli = require.resolve('prisma/build/index.js');
    const saida = execFileSync(
      process.execPath,
      [cli, 'migrate', 'deploy', `--schema=${path.join(dir, 'schema.prisma')}`],
      {
        env: { ...process.env, SUPABASE_URL_USERS: url },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { ok: true, saida };
  } catch (error: any) {
    return {
      ok: false,
      saida: `${error.stdout ?? ''}${error.stderr ?? ''}${error.message ?? ''}`,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function cliente(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } } });
}

/** Apaga o schema descartável de `url`. */
export async function apagarSchema(url: string): Promise<void> {
  const schema = new URL(url).searchParams.get('schema');
  if (!schema || schema === 'public') return;
  const db = cliente(baseUrl());
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db.$disconnect();
  }
}

/**
 * Insere uma pessoa por SQL, como o banco era ANTES da 1b (sem as colunas
 * novas). CPF de teste derivado do e-mail; senha já em hash.
 */
export async function inserirPessoaAntiga(
  db: PrismaClient,
  email: string,
  hash: string,
): Promise<void> {
  const cpf = `9${crypto.createHash('sha1').update(email).digest('hex').replace(/\D/g, '').padEnd(10, '0').slice(0, 10)}`;
  await db.$executeRaw`
    INSERT INTO "User" ("email", "password", "name", "cpf", "role", "unit", "updatedAt")
    VALUES (${email}, ${hash}, 'Pessoa Fictícia', ${cpf}, 'GERENTE_GERAL'::"UserRole", 'LUSH_IPIRANGA'::"UserUnit", now())`;
}
