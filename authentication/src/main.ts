import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import { applyTrustProxy } from './common/trust-proxy';
import { buildCorsOptions, helmetMiddleware } from './common/http-setup';
import { mountOidc } from './oidc/oidc.mount';

config();

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // IP real do cliente atrás da borda do Render + proxy local (ver
    // common/trust-proxy.ts). Sem isso, todo mundo chegava como 127.0.0.1 e
    // dividia o mesmo balde do rate limit.
    applyTrustProxy(app);

    // Configuração de compressão HTTP
    app.use(compression());

    // Configuração do cookie-parser para ler cookies httpOnly
    app.use(cookieParser());

    // Configuração de segurança com Helmet
    app.use(helmetMiddleware());

    // Prefixo interno, o proxy cuidará do "/auth"
    app.setGlobalPrefix('api');

    const isProduction = process.env.NODE_ENV === 'production';

    // Swagger
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LHG Analytics - Auth Service')
      .setDescription(
        'Serviço de autenticação e gerenciamento de usuários do grupo LHG',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT-auth',
      )
      .addServer(isProduction ? '/auth' : '/')
      .addTag('Auth')
      .addTag('Users')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);
    console.log('✅ Swagger disponível em: /auth/api');

    const prismaService = app.get(PrismaService);
    try {
      await prismaService.onModuleInit();
      console.log('✅ Prisma conectado com sucesso.');
    } catch (error) {
      console.error('❌ Erro ao conectar ao Prisma:', error);
      process.exit(1);
    }

    // Configuração global de validação
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // Remove propriedades não definidas no DTO
        forbidNonWhitelisted: true, // Rejeita requests com propriedades extras
        transform: true, // Transforma automaticamente para tipos corretos
        disableErrorMessages: false, // Mantém mensagens de erro para debug
        validationError: { target: false, value: false }, // Remove dados sensíveis dos erros
      }),
    );

    // Login central (OIDC) em /oidc, montado ANTES do CORS e do body parser
    // do Nest: o /oidc não herda o CORS das rotas /api e recebe o corpo cru.
    // Sem as variáveis OIDC_* (ou se algo falhar ao montar), SÓ o OIDC fica
    // desligado; o resto do serviço sobe.
    try {
      await mountOidc(app);
    } catch (error) {
      console.error(
        '⚠️ OIDC desligado: falha ao montar o provedor',
        (error as Error)?.name ?? 'erro',
      );
    }

    app.enableCors(buildCorsOptions());

    const port = process.env.PORT_AUTH || 3005;
    await app.listen(port);
    console.log(`✅ Auth Service escutando na porta ${port}`);
  } catch (error) {
    console.error('❌ Erro durante bootstrap:', error);
  }
}

bootstrap();
