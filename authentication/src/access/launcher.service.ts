import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ehPermissao } from './permissoes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Linha da consulta única do launcher (sistema nulo = sem flag ativa). */
type LinhaDoLauncher = {
  status: string;
  key: string | null;
  name: string | null;
  description: string | null;
  launchUrl: string | null;
  icon: string | null;
  order: number | null;
};

/** Um item do launcher do HUB. */
export interface LauncherItem {
  key: string;
  name: string;
  description: string | null;
  launchUrl: string;
  icon: string | null;
  order: number;
}

// O Chat LHG é uma rota do PRÓPRIO HUB, e não um sistema com URL própria.
const ROTA_DO_HUB: Record<string, string> = { 'chat-lhg': '/ir/chat-lhg' };

/** URL segura para o launcher: https, com host e sem usuário/senha embutidos. */
export function safeLaunchUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

@Injectable()
export class LauncherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Endereço do HUB: HUB_BASE_URL, ou a origem de INVITE_LINK_BASE_URL.
   * Sem nenhum dos dois (ou se não for https), não há URL para as rotas do HUB.
   */
  private hubBase(): string | null {
    const hub = safeLaunchUrl(this.config.get<string>('HUB_BASE_URL'));
    if (hub) return new URL(hub).origin;
    const convite = safeLaunchUrl(
      this.config.get<string>('INVITE_LINK_BASE_URL'),
    );
    return convite ? new URL(convite).origin : null;
  }

  /**
   * A pessoa (status) e os sistemas das flags ATIVAS dela no catálogo ativo,
   * numa consulta só (o banco fica longe: cada ida e volta conta). Sem a
   * pessoa → []; com a pessoa e sem sistemas → uma linha com key nula.
   */
  private linhas(onde: Prisma.Sql) {
    return this.prisma.prismaOnline.$queryRaw<LinhaDoLauncher[]>`
      SELECT u.status::text AS status, s.key, s.name, s.description,
             s."launchUrl", s.icon, s."order"
      FROM "User" u
      LEFT JOIN "SystemAccess" a ON a."userId" = u.id AND a."revokedAt" IS NULL
      LEFT JOIN "System" s ON s.key = a."systemKey" AND s.active
      WHERE ${onde}`;
  }

  /**
   * Sistemas que a pessoa pode abrir: só as flags ATIVAS dela, só o catálogo
   * ativo e só com URL segura (sem URL = fora da lista), na ordem do catálogo.
   */
  async listFor(userId: number): Promise<LauncherItem[]> {
    const itens = this.itens(await this.linhas(Prisma.sql`u.id = ${userId}`));
    if (!itens) throw new UnauthorizedException('Sessão inválida');
    return itens;
  }

  /** O mesmo, pelo publicId (o sub do login central); null = sem pessoa ativa. */
  async listForPublicId(publicId: string): Promise<LauncherItem[] | null> {
    if (!UUID.test(publicId)) return null;
    return this.itens(
      await this.linhas(Prisma.sql`u."publicId" = ${publicId}::uuid`),
    );
  }

  /** null = pessoa inexistente ou não ATIVA. */
  private itens(linhas: LinhaDoLauncher[]): LauncherItem[] | null {
    if (!linhas.length || linhas[0].status !== UserStatus.ACTIVE) return null;
    const base = this.hubBase();

    return (
      linhas
        // Permissões (ex.: 'hub-admin') nunca viram cartão.
        .filter(
          (s): s is LinhaDoLauncher & { key: string; name: string } =>
            Boolean(s.key && s.name) && !ehPermissao(s.key as string),
        )
        .map((s) => {
          const rota = ROTA_DO_HUB[s.key];
          const launchUrl = rota
            ? base && safeLaunchUrl(base + rota)
            : safeLaunchUrl(s.launchUrl);
          return launchUrl
            ? {
                key: s.key,
                name: s.name,
                description: s.description,
                launchUrl,
                icon: s.icon,
                order: Number(s.order ?? 0),
              }
            : null;
        })
        .filter((x): x is LauncherItem => x !== null)
        .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    );
  }
}
