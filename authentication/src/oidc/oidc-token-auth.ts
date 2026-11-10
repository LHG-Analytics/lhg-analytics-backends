import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as querystring from 'querystring';

/** Como o cliente se autenticou no /token (sem nunca olhar o segredo). */
export type MetodoDoCliente = 'basic' | 'post' | 'none' | 'misto';

export function metodoDoCliente(
  authorization: unknown,
  corpo: Record<string, unknown> | undefined,
): { metodo: MetodoDoCliente; clientId: string | null } {
  const basic =
    typeof authorization === 'string' && /^basic\s/i.test(authorization);
  const post =
    typeof corpo?.client_secret === 'string' && !!corpo.client_secret;
  let clientId =
    typeof corpo?.client_id === 'string' ? (corpo.client_id as string) : null;
  if (basic && !clientId) {
    try {
      const bruto = Buffer.from(
        (authorization as string).slice(6).trim(),
        'base64',
      ).toString('utf8');
      const i = bruto.indexOf(':');
      if (i > 0) {
        clientId = decodeURIComponent(bruto.slice(0, i).replace(/\+/g, '%20'));
      }
    } catch {
      clientId = null;
    }
  }
  const metodo: MetodoDoCliente =
    basic && post ? 'misto' : basic ? 'basic' : post ? 'post' : 'none';
  return { metodo, clientId };
}

/**
 * Filtro do POST /token, ANTES do provedor. O provedor aceita
 * client_secret_basic e client_secret_post (configuração global), mas o
 * segredo no CORPO (post) só vale para os clientes em `comPost` (o conector
 * do Claude, analytics-mcp). Os outros seguem SÓ com Basic (decisão D3):
 * segredo no corpo → 401 invalid_client, como o provedor responderia.
 * Os bytes do corpo são lidos aqui e DEVOLVIDOS iguais ao provedor (ele faz
 * o próprio parse, como sempre; nenhum parser fica na frente dele).
 */
export function filtroDoToken(comPost: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST' || !req.is('application/x-www-form-urlencoded')) {
      return next();
    }
    let bytes: Buffer;
    try {
      bytes = await lerCorpo(req, LIMITE_DO_CORPO);
    } catch {
      return res.status(413).json({ error: 'invalid_request' });
    }
    devolverCorpo(req, bytes);
    const corpo = querystring.parse(bytes.toString('utf8')) as Record<
      string,
      unknown
    >;
    const { metodo, clientId } = metodoDoCliente(
      req.headers.authorization,
      corpo,
    );
    if (metodo === 'post' && !(clientId && comPost.includes(clientId))) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'client authentication failed',
      });
    }
    next();
  };
}

/** O mesmo limite do provedor para o corpo. */
const LIMITE_DO_CORPO = 56 * 1024;

async function lerCorpo(req: Request, limite: number): Promise<Buffer> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const p of req as AsyncIterable<Buffer>) {
    total += p.length;
    if (total > limite) throw new Error('grande demais');
    partes.push(p);
  }
  return Buffer.concat(partes, total);
}

/** Faz o req voltar a "ter" o corpo para o provedor ler (iterator + readable). */
function devolverCorpo(req: Request, bytes: Buffer) {
  Object.defineProperty(req, 'readable', { value: true, configurable: true });
  (req as any).iterator = async function* () {
    yield bytes;
  };
}

/**
 * Motivo dos erros do /token no log (código, descrição, client_id e o
 * método recebido; NUNCA o segredo, o code ou o verifier). Para os clientes
 * em `observar`, registra também o método nos sucessos (ex.: confirmar como
 * o Claude manda o segredo).
 */
export function registrarLogsDoToken(provider: any, observar: string[]) {
  const logger = new Logger('OIDC');
  const quem = (ctx: any) => {
    const { metodo, clientId } = metodoDoCliente(
      ctx.headers?.authorization,
      ctx.oidc?.params ?? ctx.oidc?.body,
    );
    return {
      metodo,
      clientId: ctx.oidc?.client?.clientId ?? clientId ?? '-',
    };
  };
  provider.on('grant.error', (ctx: any, err: any) => {
    const q = quem(ctx);
    logger.warn(
      `oidc: token recusado erro=${String(err?.error ?? err?.message ?? 'erro').slice(0, 40)} descricao="${String(err?.error_description ?? '').slice(0, 120)}" client=${q.clientId.slice(0, 40)} metodo=${q.metodo} grant=${String(ctx.oidc?.params?.grant_type ?? '-').slice(0, 40)}`,
    );
  });
  provider.on('grant.success', (ctx: any) => {
    const q = quem(ctx);
    if (observar.includes(q.clientId)) {
      logger.log(
        `oidc: token emitido client=${q.clientId} metodo=${q.metodo} grant=${String(ctx.oidc?.params?.grant_type ?? '-').slice(0, 40)}`,
      );
    }
  });
}
