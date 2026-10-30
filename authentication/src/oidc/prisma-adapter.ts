import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Adapter de persistência do oidc-provider sobre a tabela OidcPayload: um
 * registro por (tipo, id), com o payload em JSON e as colunas de busca
 * (grantId, uid, accountId) e de validade (expiresAt, consumedAt).
 * Devolve uma CLASSE, porque o provedor instancia uma por tipo de modelo.
 */
/** Forma que o oidc-provider espera: uma classe instanciada por tipo de modelo. */
export type OidcAdapterClass = new (type: string) => Record<string, any>;

export function prismaAdapter(prisma: PrismaClient): OidcAdapterClass {
  return class PrismaOidcAdapter {
    constructor(private readonly type: string) {}

    private chave(id: string) {
      return { id_type: { id, type: this.type } };
    }

    async upsert(id: string, payload: Record<string, any>, expiresIn?: number) {
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : null;
      const dados = {
        payload: payload as Prisma.InputJsonValue,
        grantId: payload.grantId ?? null,
        uid: payload.uid ?? null,
        accountId: payload.accountId ?? null,
        expiresAt,
      };
      await prisma.oidcPayload.upsert({
        where: this.chave(id),
        create: { id, type: this.type, ...dados },
        update: dados,
      });
    }

    /** O registro, se existir e não tiver vencido. */
    private async ler(where: Prisma.OidcPayloadWhereInput) {
      const r = await prisma.oidcPayload.findFirst({
        where: { type: this.type, ...where },
      });
      if (!r || (r.expiresAt && r.expiresAt <= new Date())) return undefined;
      return {
        ...(r.payload as Record<string, any>),
        ...(r.consumedAt && {
          consumed: Math.floor(r.consumedAt.getTime() / 1000),
        }),
      };
    }

    find(id: string) {
      return this.ler({ id });
    }

    findByUid(uid: string) {
      return this.ler({ uid });
    }

    findByUserCode(userCode: string) {
      // Device flow não é usado; mantido por contrato do adapter.
      return this.ler({ payload: { path: ['userCode'], equals: userCode } });
    }

    async consume(id: string) {
      await prisma.oidcPayload.updateMany({
        where: { id, type: this.type },
        data: { consumedAt: new Date() },
      });
    }

    async destroy(id: string) {
      await prisma.oidcPayload.deleteMany({ where: { id, type: this.type } });
    }

    /** Revoga tudo o que foi emitido sob um grant (todos os tipos). */
    async revokeByGrantId(grantId: string) {
      await prisma.oidcPayload.deleteMany({ where: { grantId } });
    }
  };
}

/** Limpeza dos registros vencidos (chamada periódica). Devolve quantos saíram. */
export async function limparVencidos(prisma: PrismaClient): Promise<number> {
  const r = await prisma.oidcPayload.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return r.count;
}
