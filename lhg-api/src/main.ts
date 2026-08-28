import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { allTenants } from './tenant/tenant.registry';
import { CacheController } from './cache/cache.controller';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(compression());
  app.use(helmet());
  app.use(cookieParser());

  // CORS — mesma allowlist dos backends por unidade
  const defaultOrigins = ['https://lhg-analytics.vercel.app', 'http://localhost:3000'];
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => (o.startsWith('http') ? o : `https://${o}`));
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins, ...(renderUrl ? [renderUrl] : [])])];
  // Libera qualquer subdomínio próprio (*.lhgmoteis.com.br) — cobre front de
  // prod, dev, previews e ambientes futuros sem precisar cadastrar origem a origem.
  const lhgDomainRegex = /^https:\/\/([a-z0-9-]+\.)*lhgmoteis\.com\.br$/i;

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin) || lhgDomainRegex.test(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS bloqueado para origem: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('LHG Analytics — API Multi-Tenant')
    .setDescription(
      `Backend unificado das unidades: ${allTenants()
        .map((t) => t.slug)
        .join(', ')}. Rotas: /{unit}/api/... e /api/consolidated/... | ` +
        `Auth: Bearer token OU cookie access_token (faça login no frontend do mesmo host).`,
    )
    .setVersion('0.1')
    // Servidores: via proxy-shim (/lhg) e direto (sem proxy)
    .addServer('/lhg', 'via proxy (staging/produção com shim)')
    .addServer('/', 'direto (sem proxy)')
    // Botão Authorize (Bearer) aplicado a todas as operações
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addSecurityRequirements('JWT')
    .addTag('Company')
    .addTag('Bookings')
    .addTag('Restaurant')
    .addTag('Governance')
    .addTag('Cache')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Render injeta PORT; local usa PORT_LHG_API (3010) para não colidir com os backends antigos
  const port = process.env.PORT || process.env.PORT_LHG_API || 3010;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 lhg-api (multi-tenant) rodando na porta ${port}`);

  // Auto-warmup no boot: todo deploy/restart nasce com o cache VAZIO (Map novo,
  // ou namespace Redis que ainda não foi reaquecido neste ciclo). Dispara o
  // warmup em BACKGROUND após um pequeno atraso — tempo do health-check inicial
  // passar antes da carga. Desligável com WARMUP_ON_BOOT=false (ex.: instância
  // free de dev com pouca memória). O warmup segue rodando também no cron 0/6/12/15h.
  if (process.env.WARMUP_ON_BOOT !== 'false') {
    const delayMs = Number(process.env.WARMUP_ON_BOOT_DELAY_MS) || 15000;
    setTimeout(() => {
      try {
        app.get(CacheController, { strict: false }).warmup();
        console.log(`🔥 Auto-warmup disparado no boot (após ${delayMs}ms).`);
      } catch (err) {
        console.error('Falha ao disparar auto-warmup no boot:', err);
      }
    }, delayMs);
  }
}

bootstrap().catch((error) => {
  console.error('Erro fatal no bootstrap do lhg-api:', error);
  process.exit(1);
});
