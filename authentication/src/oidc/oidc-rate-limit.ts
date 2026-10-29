import type { NextFunction, Request, Response } from 'express';
import { clientIp } from '../common/client-ip';

/** Janela fixa de 1 minuto, por IP REAL e por tipo de rota. */
const JANELA_MS = 60 * 1000;

/**
 * Limites por minuto e por IP nas rotas do login central. O bloqueio
 * PRINCIPAL continua sendo o por conta (1c); este é o complementar por IP.
 * O /token é chamado pelo SERVIDOR dos clientes (vários usuários atrás do
 * mesmo IP), por isso o limite maior.
 */
export const LIMITES = {
  login: 10, // POST /interaction/:uid/login e POST /conta/senha
  google: 20, // POST /interaction/:uid/google e GET /google/callback
  auth: 60, // GET /auth (e a retomada /auth/:uid)
  token: 300, // POST /token
  outras: 120, // discovery, jwks, session/end, telas
} as const;
export type Regra = keyof typeof LIMITES;

/** Qual regra vale para esta rota (caminho relativo ao /oidc). */
export function regraDa(method: string, caminho: string): Regra {
  if (
    method === 'POST' &&
    (/^\/interaction\/[^/]+\/login$/.test(caminho) ||
      caminho === '/conta/senha')
  ) {
    return 'login';
  }
  if (
    (method === 'POST' && /^\/interaction\/[^/]+\/google$/.test(caminho)) ||
    caminho === '/google/callback'
  ) {
    return 'google';
  }
  if (/^\/auth(\/|$)/.test(caminho)) return 'auth';
  if (caminho === '/token') return 'token';
  return 'outras';
}

/**
 * Limitador em memória (o authentication é 1 processo). Devolve um
 * middleware Express; acima do limite → 429 com Retry-After.
 */
export function limitadorDoOidc(agora: () => number = Date.now) {
  const contas = new Map<string, { inicio: number; n: number }>();
  let ultimaLimpeza = agora();

  return (req: Request, res: Response, next: NextFunction) => {
    const t = agora();
    if (t - ultimaLimpeza > JANELA_MS) {
      for (const [k, v] of contas)
        if (t - v.inicio >= JANELA_MS) contas.delete(k);
      ultimaLimpeza = t;
    }
    const caminho = (req.path || '/').replace(/\/$/, '') || '/';
    const regra = regraDa(req.method, caminho);
    const chave = `${regra}|${clientIp(req) ?? 'sem-ip'}`;
    let c = contas.get(chave);
    if (!c || t - c.inicio >= JANELA_MS) {
      c = { inicio: t, n: 0 };
      contas.set(chave, c);
    }
    c.n++;
    if (c.n <= LIMITES[regra]) return next();

    const espera = Math.max(1, Math.ceil((c.inicio + JANELA_MS - t) / 1000));
    res.setHeader('Retry-After', String(espera));
    res.setHeader('Cache-Control', 'no-store');
    res.status(429).json({
      message: 'Muitas tentativas. Tente de novo em instantes.',
    });
  };
}
