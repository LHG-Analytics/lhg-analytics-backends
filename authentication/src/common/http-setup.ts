import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import helmet from 'helmet';

/** Helmet do serviço (o /oidc troca o CSP pelo dele, ver oidc-pages.ts). */
export function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });
}

/**
 * CORS das rotas /api (lista de origens + credenciais). NÃO vale para o
 * /oidc: o provedor é montado antes do enableCors e cuida do próprio CORS.
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env) {
  // Origens padrão permitidas
  const defaultOrigins = [
    'https://lhg-analytics.vercel.app', // Frontend em produção
    'http://localhost:3000', // Proxy/Frontend local
    'http://localhost:3005', // Authentication service (Swagger local)
  ];

  // Combina origens padrão com origens do ambiente
  const envOrigins =
    env.ALLOWED_ORIGINS?.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => {
        // Adiciona https:// se não tiver protocolo
        if (!o.match(/^https?:\/\//)) {
          return `https://${o}`;
        }
        return o;
      }) || [];

  // Adiciona URL do próprio servidor (para Swagger funcionar no Render)
  const serverUrl = env.RENDER_EXTERNAL_URL;
  const allowedOrigins = [
    ...new Set([
      ...defaultOrigins,
      ...envOrigins,
      ...(serverUrl ? [serverUrl] : []),
    ]),
  ];

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Permite requisições sem origin (Postman, curl, health checks)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Verifica se a origin está na lista permitida
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Log de CORS rejeitado (para debug)
      console.warn('⚠️ CORS rejeitou origem:', origin);

      callback(new Error('Not allowed by CORS'), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
    maxAge: 86400, // 24 horas de cache para preflight
  };
  return corsOptions;
}

/**
 * CORS por requisição: as rotas do Analytics como CLIENTE do HUB
 * (/api/hub/*) são navegação (callback, logout por formulário) ou chamada
 * servidor a servidor (back-channel), então ficam FORA do CORS do navegador
 * (sem cabeçalhos CORS e sem o erro de origem). As demais seguem as regras
 * de buildCorsOptions.
 */
export function buildCorsDelegate(env: NodeJS.ProcessEnv = process.env) {
  const opcoes = buildCorsOptions(env);
  return (
    req: { url?: string },
    callback: (err: Error | null, options?: CorsOptions) => void,
  ) => {
    const caminho = (req.url ?? '').split('?')[0];
    if (/^\/api\/hub(\/|$)/.test(caminho)) {
      callback(null, { origin: false });
      return;
    }
    callback(null, opcoes);
  };
}
