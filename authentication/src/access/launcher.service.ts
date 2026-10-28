import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
   * Sistemas que a pessoa pode abrir: só as flags ATIVAS dela, só o catálogo
   * ativo e só com URL segura (sem URL = fora da lista), na ordem do catálogo.
   */
  async listFor(userId: number): Promise<LauncherItem[]> {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Sessão inválida');
    }

    const acessos = await this.prisma.prismaOnline.systemAccess.findMany({
      where: { userId, revokedAt: null, system: { active: true } },
      include: { system: true },
    });
    const base = this.hubBase();

    return acessos
      .map(({ system: s }) => {
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
              order: s.order,
            }
          : null;
      })
      .filter((x): x is LauncherItem => x !== null)
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  }
}
