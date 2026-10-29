import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Evento que gera o aviso de logout (back-channel) aos clientes. */
export type EventoDeLogout =
  | 'logout'
  | 'inactivation'
  | 'password_change'
  | 'flag_revoked';

interface Autorizacao {
  sid?: string;
  grantId?: string;
}

type Aviso = { clientId: string; sub: string; sid: string | null };

/**
 * Encerramento no login central (1d-D3), só com o banco (não depende do
 * provedor estar ligado): revoga grants (e com eles os refresh/access tokens
 * daquele grant), derruba sessões SSO e enfileira o aviso de logout
 * (back-channel) no Outbox, só para os clientes atingidos que têm
 * backchannelLogoutUri. O envio é do OutboxWorker, com novas tentativas.
 *
 * Regra combinada com o HUB (refresh do hub não cai com a sessão SSO): todo
 * encerramento REVOGA o grant/refresh do cliente, não só a sessão SSO.
 */
@Injectable()
export class OidcLogoutService {
  private readonly logger = new Logger('OIDC');

  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.prismaOnline;
  }

  /** Clientes ATIVOS com backchannelLogoutUri (só eles recebem o aviso). */
  private async clientesComAviso(clientIds: string[]): Promise<Set<string>> {
    if (!clientIds.length) return new Set();
    const cs = await this.db.oidcClient.findMany({
      where: {
        clientId: { in: [...new Set(clientIds)] },
        active: true,
        backchannelLogoutUri: { not: null },
      },
      select: { clientId: true },
    });
    return new Set(cs.map((c) => c.clientId));
  }

  /** Grava os avisos (um por cliente + sid), só para quem tem a URI. */
  async enfileirar(evento: EventoDeLogout, avisos: Aviso[]): Promise<number> {
    const comAviso = await this.clientesComAviso(avisos.map((a) => a.clientId));
    const vistos = new Set<string>();
    const linhas = avisos.filter((a) => {
      const chave = `${a.clientId}|${a.sid ?? ''}`;
      if (!comAviso.has(a.clientId) || vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
    if (!linhas.length) return 0;
    await this.db.outbox.createMany({
      data: linhas.map((a) => ({ ...a, event: evento })),
    });
    return linhas.length;
  }

  /**
   * Logout no HUB (end_session confirmado com "sair de tudo"): o provedor
   * destruiu a sessão, mas NÃO revoga os grants cujo refresh sobrevive à
   * sessão (persistsLogout, o caso do hub). Aqui: revoga os grants de TODOS
   * os clientes da sessão e enfileira os avisos, com o sid de cada um.
   */
  async aposLogoutCompleto(session: {
    accountId?: string;
    authorizations?: Record<string, Autorizacao>;
  }): Promise<number> {
    if (!session?.accountId) return 0;
    const grantIds = Object.values(session.authorizations ?? {})
      .map((a) => a?.grantId)
      .filter((g): g is string => !!g);
    if (grantIds.length) {
      await this.db.oidcPayload.deleteMany({
        where: {
          OR: [
            { grantId: { in: grantIds } },
            { type: 'Grant', id: { in: grantIds } },
          ],
        },
      });
    }
    const avisos = Object.entries(session.authorizations ?? {}).map(
      ([clientId, a]) => ({
        clientId,
        sub: session.accountId!,
        sid: a?.sid ?? null,
      }),
    );
    return this.enfileirar('logout', avisos);
  }

  /**
   * Encerra a pessoa nos clientes do login central:
   * - inactivation: TODAS as sessões SSO e TODOS os grants; aviso a todos os
   *   clientes que ela usava;
   * - password_change: as OUTRAS sessões SSO e os grants delas (e os grants
   *   soltos, sem sessão); a sessão `manterSessao` e os grants dela ficam;
   * - flag_revoked: só os grants dos clientes do sistema `systemKey`; as
   *   sessões SSO ficam (os outros sistemas continuam).
   * Devolve quantos grants/sessões caíram e quantos avisos foram enfileirados.
   */
  async encerrar(
    publicId: string,
    evento: Exclude<EventoDeLogout, 'logout'>,
    opts: { manterSessao?: string; systemKey?: string } = {},
  ): Promise<{ grants: number; sessoes: number; avisos: number }> {
    const linhas = await this.db.oidcPayload.findMany({
      where: { accountId: publicId, type: { in: ['Session', 'Grant'] } },
      select: { id: true, type: true, payload: true },
    });
    const sessoes = linhas.filter((l) => l.type === 'Session');
    const grants = linhas
      .filter((l) => l.type === 'Grant')
      .map((g) => ({
        id: g.id,
        clientId: (g.payload as any)?.clientId as string,
      }));

    let noEscopo: (clientId: string) => boolean = () => true;
    if (evento === 'flag_revoked') {
      const doSistema = await this.db.oidcClient.findMany({
        where: { systemKey: opts.systemKey ?? '__nenhum__' },
        select: { clientId: true },
      });
      const ids = new Set(doSistema.map((c) => c.clientId));
      noEscopo = (c) => ids.has(c);
    }

    const autorizacoes = (s: (typeof sessoes)[number]) =>
      Object.entries(
        ((s.payload as any)?.authorizations ?? {}) as Record<
          string,
          Autorizacao
        >,
      );
    const mantida =
      evento === 'password_change' && opts.manterSessao
        ? sessoes.find((s) => s.id === opts.manterSessao)
        : undefined;
    const grantsMantidos = new Set(
      mantida ? autorizacoes(mantida).map(([, a]) => a?.grantId) : [],
    );

    const grantsRevogar = grants.filter(
      (g) => noEscopo(g.clientId) && !grantsMantidos.has(g.id),
    );
    const sessoesEncerrar =
      evento === 'flag_revoked' ? [] : sessoes.filter((s) => s !== mantida);

    const avisos: Aviso[] = [];
    for (const s of sessoesEncerrar) {
      for (const [clientId, a] of autorizacoes(s)) {
        avisos.push({ clientId, sub: publicId, sid: a?.sid ?? null });
      }
    }
    // Clientes cujos grants caíram sem sessão SSO junto (refresh solto, ou
    // flag revogada): aviso por sub (todas as sessões da pessoa no cliente).
    const comSid = new Set(avisos.map((a) => a.clientId));
    for (const g of grantsRevogar) {
      if (g.clientId && !comSid.has(g.clientId)) {
        avisos.push({ clientId: g.clientId, sub: publicId, sid: null });
      }
    }

    const ids = grantsRevogar.map((g) => g.id);
    await this.db.$transaction([
      this.db.oidcPayload.deleteMany({
        where: {
          OR: [{ grantId: { in: ids } }, { type: 'Grant', id: { in: ids } }],
        },
      }),
      this.db.oidcPayload.deleteMany({
        where: {
          type: 'Session',
          id: { in: sessoesEncerrar.map((s) => s.id) },
        },
      }),
    ]);
    const enfileirados = await this.enfileirar(evento, avisos);
    if (ids.length || sessoesEncerrar.length) {
      this.logger.log(
        `oidc: ${evento} → ${ids.length} grant(s) e ${sessoesEncerrar.length} sessão(ões) encerrados, ${enfileirados} aviso(s) na fila`,
      );
    }
    return {
      grants: ids.length,
      sessoes: sessoesEncerrar.length,
      avisos: enfileirados,
    };
  }

  /**
   * Versão para quem chama depois de uma mudança já gravada (inativação,
   * troca de senha, flag): uma falha aqui NÃO desfaz a mudança (a pessoa já
   * é recusada no próximo code/refresh), mas vira linha de ALERTA no log.
   */
  async encerrarSemFalhar(
    publicId: string | null | undefined,
    evento: Exclude<EventoDeLogout, 'logout'>,
    opts: { manterSessao?: string; systemKey?: string } = {},
  ): Promise<void> {
    if (!publicId) return;
    try {
      await this.encerrar(publicId, evento, opts);
    } catch (e) {
      this.logger.error(
        `ALERTA oidc: falha ao encerrar (${evento}): ${(e as Error)?.name ?? 'erro'}`,
      );
    }
  }
}
