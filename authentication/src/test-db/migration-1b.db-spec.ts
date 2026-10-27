// Migration 1b contra um Postgres de verdade (prisma migrate deploy).
// Numeração = testes obrigatórios da especificação da etapa 1b.
import * as bcrypt from 'bcrypt';
import {
  MIGRATION_1B,
  apagarSchema,
  cliente,
  inserirPessoaAntiga,
  migrar,
  novoSchema,
} from './db-helpers';

const HASH = bcrypt.hashSync('senha-de-teste-123', 4);
const schemas: string[] = [];
const novo = (prefixo: string) => {
  const url = novoSchema(prefixo);
  schemas.push(url);
  return url;
};

afterAll(async () => {
  for (const url of schemas) await apagarSchema(url);
});

describe('migration 1b', () => {
  it('8. banco vazio: migrate deploy + seed fictício sem erro, e a conferência fecha', async () => {
    const url = novo('t8');
    const r = migrar(url);
    expect(r.saida).toContain('All migrations have been successfully applied');
    expect(r.ok).toBe(true);

    const db = cliente(url);
    try {
      // Seed fictício como o cadastro faz: pessoa + flag do Analytics.
      for (const email of ['a@example.invalid', 'b@example.invalid']) {
        await db.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              email,
              password: HASH,
              cpf: email.startsWith('a') ? '90000000191' : '90000000272',
              role: 'GERENTE_GERAL',
              unit: 'LIV', // valor que faltava nas migrations antigas
            },
          });
          await tx.systemAccess.create({
            data: { userId: u.id, systemKey: 'analytics' },
          });
        });
      }
      expect(await db.system.count()).toBe(6);
      const flags = await db.systemAccess.count({
        where: { systemKey: 'analytics', revokedAt: null },
      });
      expect(flags).toBe(await db.user.count());
    } finally {
      await db.$disconnect();
    }
  });

  it('8. backfill: quem já existia ganha ACTIVE, publicId próprio e a flag do Analytics desde o cadastro', async () => {
    const url = novo('t8b');
    expect(migrar(url, MIGRATION_1B).ok).toBe(true);
    const db = cliente(url);
    try {
      for (let i = 0; i < 3; i++) {
        await inserirPessoaAntiga(db, `antiga${i}@example.invalid`, HASH);
      }
      expect(migrar(url).ok).toBe(true);

      const pessoas = await db.user.findMany({
        include: { systemAccesses: true },
      });
      expect(pessoas).toHaveLength(3);
      expect(new Set(pessoas.map((p) => p.publicId)).size).toBe(3);
      for (const p of pessoas) {
        expect(p.status).toBe('ACTIVE');
        expect(p.systemAccesses).toHaveLength(1);
        expect(p.systemAccesses[0].systemKey).toBe('analytics');
        expect(p.systemAccesses[0].revokedAt).toBeNull();
        expect(p.systemAccesses[0].grantedAt.getTime()).toBe(
          p.createdAt.getTime(),
        );
      }
    } finally {
      await db.$disconnect();
    }
  });

  it('14. e-mails que só diferem por maiúsculas travam a migration e NADA muda', async () => {
    const url = novo('t14');
    expect(migrar(url, MIGRATION_1B).ok).toBe(true);
    const db = cliente(url);
    try {
      await inserirPessoaAntiga(db, 'fulano@x.com', HASH);
      await inserirPessoaAntiga(db, 'Fulano@X.com', HASH);

      const r = migrar(url);
      expect(r.ok).toBe(false);
      expect(r.saida).toContain('1 grupo(s) de e-mails');
      // A mensagem traz só a contagem, nunca os e-mails.
      expect(r.saida).not.toContain('fulano@x.com');

      const [estado] = await db.$queryRaw<
        { sem_system: boolean; colunas_novas: number; emails: string[] }[]
      >`
        SELECT to_regclass('"System"') IS NULL AS sem_system,
               (SELECT count(*)::int FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = 'User'
                   AND column_name IN ('publicId', 'status')) AS colunas_novas,
               (SELECT array_agg(email ORDER BY email) FROM "User") AS emails`;
      expect(estado.sem_system).toBe(true);
      expect(estado.colunas_novas).toBe(0);
      expect(estado.emails).toEqual(['Fulano@X.com', 'fulano@x.com']);
    } finally {
      await db.$disconnect();
    }
  });

  it('15. normaliza os e-mails existentes (minúsculas, sem espaços nas pontas)', async () => {
    const url = novo('t15');
    expect(migrar(url, MIGRATION_1B).ok).toBe(true);
    const db = cliente(url);
    try {
      await inserirPessoaAntiga(db, '  Maria@Example.INVALID ', HASH);
      await inserirPessoaAntiga(db, 'JOSE@example.invalid', HASH);
      await inserirPessoaAntiga(db, 'ana@example.invalid', HASH);
      expect(migrar(url).ok).toBe(true);

      const emails = (
        await db.user.findMany({ orderBy: { email: 'asc' } })
      ).map((u) => u.email);
      expect(emails).toEqual([
        'ana@example.invalid',
        'jose@example.invalid',
        'maria@example.invalid',
      ]);
    } finally {
      await db.$disconnect();
    }
  });

  describe('depois da migration', () => {
    let url: string;
    let db: ReturnType<typeof cliente>;

    beforeAll(() => {
      url = novo('tpos');
      expect(migrar(url).ok).toBe(true);
      db = cliente(url);
    });
    afterAll(() => db.$disconnect());

    const pessoa = (email: string, cpf: string) =>
      db.user.create({
        data: { email, cpf, password: HASH, role: 'ADMIN', unit: 'LHG' },
      });

    it('o trigger grava o e-mail normalizado (o código antigo não recebe erro)', async () => {
      const u = await pessoa('  Beltrano@Example.INVALID ', '90000000353');
      expect(u.email).toBe('beltrano@example.invalid');

      const atualizado = await db.user.update({
        where: { id: u.id },
        data: { email: 'BELTRANO.NOVO@example.invalid' },
      });
      expect(atualizado.email).toBe('beltrano.novo@example.invalid');

      const sec = await db.userEmail.create({
        data: { userId: u.id, email: ' Outro@Example.INVALID' },
      });
      expect(sec.email).toBe('outro@example.invalid');
    });

    it('11. (banco) UserEmail igual ao principal de outra pessoa é recusado', async () => {
      const dono = await pessoa('dono@example.invalid', '90000000434');
      const outro = await pessoa('outro2@example.invalid', '90000000515');
      await expect(
        db.userEmail.create({
          data: { userId: outro.id, email: 'DONO@example.invalid' },
        }),
      ).rejects.toThrow(/EMAIL_IN_USE/);
      expect(await db.userEmail.count({ where: { userId: outro.id } })).toBe(0);
      expect(dono.email).toBe('dono@example.invalid');
    });

    it('11. (banco) User.email igual ao secundário de outra pessoa é recusado (insert e update)', async () => {
      const a = await pessoa('pessoa.a@example.invalid', '90000000696');
      await db.userEmail.create({
        data: { userId: a.id, email: 'segundo.a@example.invalid' },
      });
      await expect(
        pessoa('Segundo.A@example.invalid', '90000000777'),
      ).rejects.toThrow(/EMAIL_IN_USE/);

      const b = await pessoa('pessoa.b@example.invalid', '90000000858');
      await expect(
        db.user.update({
          where: { id: b.id },
          data: { email: 'segundo.a@example.invalid' },
        }),
      ).rejects.toThrow(/EMAIL_IN_USE/);
    });

    it('1 acesso ATIVO por (pessoa, sistema); revogado fica no histórico', async () => {
      const u = await pessoa('flag@example.invalid', '90000000939');
      const ativo = await db.systemAccess.create({
        data: { userId: u.id, systemKey: 'cms' },
      });
      await expect(
        db.systemAccess.create({ data: { userId: u.id, systemKey: 'cms' } }),
      ).rejects.toThrow();
      await db.systemAccess.update({
        where: { id: ativo.id },
        data: { revokedAt: new Date() },
      });
      await expect(
        db.systemAccess.create({ data: { userId: u.id, systemKey: 'cms' } }),
      ).resolves.toBeDefined();
    });

    it('apagar a pessoa leva junto acessos, e-mails e vínculos (fase expand)', async () => {
      const u = await pessoa('apagar@example.invalid', '90000001072');
      await db.systemAccess.create({
        data: { userId: u.id, systemKey: 'analytics' },
      });
      await db.userEmail.create({
        data: { userId: u.id, email: 'apagar.sec@example.invalid' },
      });
      await db.systemAccount.create({
        data: { userId: u.id, systemKey: 'cms', externalId: '42' },
      });
      await db.userUnitAccess.create({ data: { userId: u.id, unit: 'TOUT' } });
      await db.auditEvent.create({
        data: { action: 'teste', targetUserId: u.id },
      });

      await db.user.delete({ where: { id: u.id } });

      expect(await db.systemAccess.count({ where: { userId: u.id } })).toBe(0);
      expect(await db.userEmail.count({ where: { userId: u.id } })).toBe(0);
      expect(await db.systemAccount.count({ where: { userId: u.id } })).toBe(0);
      expect(await db.userUnitAccess.count({ where: { userId: u.id } })).toBe(
        0,
      );
      // A auditoria sobrevive (sem FK para User).
      expect(await db.auditEvent.count({ where: { targetUserId: u.id } })).toBe(
        1,
      );
    });
  });
});
