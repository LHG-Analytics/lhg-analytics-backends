import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { lookup } from 'dns/promises';
import * as https from 'https';
import { isIP } from 'net';
import { importJWK, JWK, SignJWT } from 'jose';
import { AccessService } from '../access/access.service';

/** Janela padrão de novas tentativas de um aviso (spec: até 24 h). */
export const OUTBOX_HORAS_PADRAO = 24;
const TIMEOUT_MS = 5000;
const LOTE = 20;
/** Reserva de uma linha enquanto ela é enviada (outro processo não pega). */
const RESERVA_MIN = 5;
export const EVENTO_BACKCHANNEL =
  'http://schemas.openid.net/event/backchannel-logout';

/** OIDC_OUTBOX_MAX_HORAS: inteiro de 1 a 24; fora disso (ou ausente), 24. */
export function lerMaxHoras(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 24 ? n : OUTBOX_HORAS_PADRAO;
}

/** Espera antes da tentativa seguinte: 1, 2, 4, 8... minutos, até 60. */
export function esperaMin(tentativas: number): number {
  return Math.min(2 ** Math.max(tentativas - 1, 0), 60);
}

/**
 * Anti-SSRF: o IP é público? Recusa loopback, redes privadas, link-local
 * (inclusive o endereço de metadados das nuvens), CGNAT, multicast,
 * reservados e os equivalentes em IPv6.
 */
export function ipPublico(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false; // link-local / metadados
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return false;
    if (x.startsWith('::ffff:')) return ipPublico(x.slice(7));
    if (/^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff')) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Envia o POST e devolve o status HTTP. Recebe o IP JÁ CONFERIDO pelo
 * anti-SSRF: a conexão vai SÓ para ele (sem nova resolução de DNS).
 */
export type Enviar = (
  url: string,
  corpo: string,
  ip: string,
) => Promise<number>;

/**
 * Opções do https.request com o IP PRESO (contra DNS rebinding: o DNS não é
 * consultado de novo entre a conferência e a conexão). O TLS continua
 * validando o certificado pelo NOME do host (servername/SNI).
 */
export function opcoesComIpFixo(url: string, ip: string): https.RequestOptions {
  const u = new URL(url);
  const familia = isIP(ip);
  return {
    method: 'POST',
    host: u.hostname,
    servername: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    lookup: (_host, opts, cb) => {
      // Node pede um endereço ou a lista (all); nos dois casos, só o fixo.
      if ((opts as { all?: boolean })?.all) {
        (cb as any)(null, [{ address: ip, family: familia }]);
      } else {
        (cb as any)(null, ip, familia);
      }
    },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: TIMEOUT_MS,
  };
}

/** Envio real: https.request com o IP preso; não segue redirect; descarta o corpo. */
export const enviarComIpFixo: Enviar = (url, corpo, ip) =>
  new Promise((resolve, reject) => {
    const req = https.request(opcoesComIpFixo(url, ip), (res) => {
      res.resume(); // só o código: o corpo da resposta é descartado
      resolve(res.statusCode ?? 0);
    });
    req.on('timeout', () => {
      const e = new Error('timeout');
      e.name = 'TimeoutError';
      req.destroy(e);
    });
    req.on('error', reject);
    req.end(corpo);
  });

export interface OutboxDeps {
  /** Envio (trocado nos testes pelo receptor de teste). */
  enviar?: Enviar;
  /** Resolução de DNS (trocada nos testes). */
  resolver?: (host: string) => Promise<string[]>;
  agora?: () => Date;
}

type Linha = {
  id: bigint;
  clientId: string;
  sub: string;
  sid: string | null;
  event: string;
  attempts: number;
  createdAt: Date;
};

/**
 * Envio do back-channel logout a partir do Outbox. O logout token é gerado
 * NA HORA do envio (nunca fica guardado) e vai no CORPO (POST
 * application/x-www-form-urlencoded, logout_token=...), nunca na URL.
 * Só https para host público, com o IP conferido PRESO na conexão (sem DNS
 * rebinding), sem seguir redirect, timeout de 5 s. Falha →
 * nova tentativa com espera crescente; passou da janela → status failed,
 * AuditEvent outbox.failed e uma linha de ALERTA no log. Do erro guarda só o
 * código HTTP ou o tipo (nunca o corpo da resposta).
 */
export class OutboxWorker {
  private readonly logger = new Logger('OIDC');
  private chave?: Promise<{ key: any; kid: string }>;
  private readonly enviar: Enviar;
  private readonly resolver: (host: string) => Promise<string[]>;
  private readonly agora: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly issuer: string,
    private readonly jwkAssinatura: Record<string, any>,
    private readonly maxHoras: number,
    deps: OutboxDeps = {},
  ) {
    this.enviar = deps.enviar ?? enviarComIpFixo;
    this.resolver =
      deps.resolver ??
      (async (h) => (await lookup(h, { all: true })).map((r) => r.address));
    this.agora = deps.agora ?? (() => new Date());
  }

  private assinatura() {
    this.chave ??= importJWK(this.jwkAssinatura as JWK, 'RS256').then(
      (key) => ({
        key,
        kid: String(this.jwkAssinatura.kid),
      }),
    );
    return this.chave;
  }

  /** Logout token (OIDC Back-Channel Logout 1.0): events, sub/sid, SEM nonce. */
  async logoutToken(clientId: string, sub: string, sid: string | null) {
    const { key, kid } = await this.assinatura();
    return new SignJWT({
      events: { [EVENTO_BACKCHANNEL]: {} },
      ...(sid && { sid }),
    })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'logout+jwt' })
      .setIssuer(this.issuer)
      .setAudience(clientId)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime('2m')
      .setJti(crypto.randomUUID())
      .sign(key);
  }

  /**
   * Reserva até LOTE linhas vencidas (FOR UPDATE SKIP LOCKED). As datas do
   * Outbox são todas do relógio do APP (criação, espera, reserva): comparar
   * com o now() do banco erraria por milissegundos de diferença de relógio.
   */
  private reservar(): Promise<Linha[]> {
    const agora = this.agora();
    const reserva = new Date(agora.getTime() + RESERVA_MIN * 60 * 1000);
    return this.prisma.$queryRaw<Linha[]>`
      UPDATE "Outbox"
         SET "nextAttemptAt" = ${reserva},
             "updatedAt" = ${agora}
       WHERE id IN (
         SELECT id FROM "Outbox"
          WHERE status = 'pending' AND "nextAttemptAt" <= ${agora}
          ORDER BY id
          LIMIT ${LOTE}
          FOR UPDATE SKIP LOCKED)
      RETURNING id, "clientId", sub, sid, event, attempts, "createdAt"`;
  }

  /** Envia uma vez; devolve null (2xx) ou o código do erro. */
  private async entregar(uri: string, corpo: string): Promise<string | null> {
    let u: URL;
    try {
      u = new URL(uri);
    } catch {
      return 'uri';
    }
    if (u.protocol !== 'https:' || u.username || u.password) return 'uri';
    const host = u.hostname.replace(/^\[|\]$/g, '');
    let ips: string[];
    try {
      ips = isIP(host) ? [host] : await this.resolver(host);
    } catch {
      return 'dns';
    }
    if (!ips.length || !ips.every(ipPublico)) return 'ssrf';
    try {
      // A conexão vai para o 1º IP conferido, e só para ele.
      const status = await this.enviar(uri, corpo, ips[0]);
      return status >= 200 && status < 300 ? null : String(status);
    } catch (e) {
      const nome = (e as Error)?.name;
      return nome === 'TimeoutError' || nome === 'AbortError'
        ? 'timeout'
        : 'rede';
    }
  }

  /** Uma passada: reserva, envia e registra. Devolve quantas linhas tratou. */
  async rodarUmaVez(): Promise<number> {
    const linhas = await this.reservar();
    for (const l of linhas) await this.tratar(l);
    return linhas.length;
  }

  private async tratar(l: Linha) {
    const cliente = await this.prisma.oidcClient.findUnique({
      where: { clientId: l.clientId },
      select: { active: true, backchannelLogoutUri: true },
    });
    const tentativas = l.attempts + 1;
    let erro: string | null;
    if (!cliente?.active || !cliente.backchannelLogoutUri) {
      erro = 'sem_uri';
    } else {
      const token = await this.logoutToken(l.clientId, l.sub, l.sid);
      erro = await this.entregar(
        cliente.backchannelLogoutUri,
        new URLSearchParams({ logout_token: token }).toString(),
      );
    }

    if (!erro) {
      await this.prisma.outbox.update({
        where: { id: l.id },
        data: { status: 'sent', attempts: tentativas, lastErrorCode: null },
      });
      return;
    }

    const agora = this.agora();
    const venceu =
      agora.getTime() - new Date(l.createdAt).getTime() >=
      this.maxHoras * 3600 * 1000;
    if (!venceu && erro !== 'sem_uri') {
      await this.prisma.outbox.update({
        where: { id: l.id },
        data: {
          attempts: tentativas,
          lastErrorCode: erro,
          nextAttemptAt: new Date(
            agora.getTime() + esperaMin(tentativas) * 60 * 1000,
          ),
        },
      });
      return;
    }

    await this.prisma.outbox.update({
      where: { id: l.id },
      data: { status: 'failed', attempts: tentativas, lastErrorCode: erro },
    });
    const pessoa = await this.prisma.user.findUnique({
      where: { publicId: l.sub },
      select: { id: true },
    });
    await this.access.audit({
      action: 'outbox.failed',
      targetUserId: pessoa?.id,
      metadata: {
        outboxId: l.id.toString(),
        clientId: l.clientId,
        event: l.event,
        attempts: tentativas,
        lastErrorCode: erro,
      },
    });
    this.logger.error(
      `ALERTA outbox.failed cliente=${l.clientId} evento=${l.event} tentativas=${tentativas} ultimo=${erro}`,
    );
  }
}
