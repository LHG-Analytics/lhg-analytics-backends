/**
 * uid da interação → client_id, guardado quando o provedor CRIA a interação
 * (interactions.url). Serve só para dar uma saída quando a interação já
 * venceu ou foi concluída (ex.: o form de login enviado duas vezes): o
 * destino vem do cadastro do cliente no banco, NUNCA da URL. Em memória (o
 * authentication roda em 1 processo), com TTL igual ao da interação no
 * provedor (60 min) e limite de tamanho.
 */
export const INTERACAO_TTL_MS = 60 * 60 * 1000;
export const INTERACAO_MAX = 10_000;

export class MemoriaDeInteracoes {
  private readonly m = new Map<string, { clientId: string; ate: number }>();

  constructor(
    private readonly ttlMs = INTERACAO_TTL_MS,
    private readonly max = INTERACAO_MAX,
    /** Relógio (substituível nos testes). */
    readonly agora: () => number = () => Date.now(),
  ) {}

  registrar(uid: unknown, clientId: unknown): void {
    if (
      typeof uid !== 'string' ||
      !uid ||
      typeof clientId !== 'string' ||
      !clientId
    )
      return;
    const agora = this.agora();
    this.m.delete(uid); // reinsere no fim (a ordem do Map é a de inserção)
    this.m.set(uid, { clientId, ate: agora + this.ttlMs });
    // Vencidos saem pela frente; acima do limite, saem os mais antigos.
    for (const [k, v] of this.m) {
      if (v.ate > agora && this.m.size <= this.max) break;
      this.m.delete(k);
    }
  }

  clienteDe(uid: unknown): string | null {
    if (typeof uid !== 'string') return null;
    const e = this.m.get(uid);
    if (!e) return null;
    if (e.ate <= this.agora()) {
      this.m.delete(uid);
      return null;
    }
    return e.clientId;
  }

  get tamanho(): number {
    return this.m.size;
  }
}

/**
 * Hosts reservados (RFC 2606/6761): um launchUrl de exemplo (ex.: o seed da
 * homologação, *.exemplo.invalid) não serve de destino real.
 */
export function hostReservado(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h === 'localhost' ||
      /\.(invalid|example|test|localhost)$/.test(h) ||
      /(^|\.)example\.(com|net|org)$/.test(h)
    );
  } catch {
    return true;
  }
}
