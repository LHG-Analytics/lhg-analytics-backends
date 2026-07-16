import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { allTenants } from './tenant/tenant.registry';

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

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
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
        .join(', ')}. Rotas: /{unit}/api/...`,
    )
    .setVersion('0.1')
    .addTag('Restaurant')
    .addTag('Cache')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Render injeta PORT; local usa PORT_LHG_API (3010) para não colidir com os backends antigos
  const port = process.env.PORT || process.env.PORT_LHG_API || 3010;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 lhg-api (multi-tenant) rodando na porta ${port}`);
}

bootstrap().catch((error) => {
  console.error('Erro fatal no bootstrap do lhg-api:', error);
  process.exit(1);
});
