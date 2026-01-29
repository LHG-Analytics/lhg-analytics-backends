import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';

config();

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // Configuração do cookie-parser para ler cookies httpOnly
    app.use(cookieParser());

    // Configuração de segurança com Helmet
    app.use(
      helmet({
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
      }),
    );

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

    // Origens padrão permitidas
    const defaultOrigins = [
      'https://lhg-analytics.vercel.app', // Frontend em produção
      'http://localhost:3000', // Proxy/Frontend local
      'http://localhost:3005', // Authentication service (Swagger local)
    ];

    // Combina origens padrão com origens do ambiente
    const envOrigins = process.env.ALLOWED_ORIGINS
      ?.split(',')
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
    const serverUrl = process.env.RENDER_EXTERNAL_URL;
    const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins, ...(serverUrl ? [serverUrl] : [])])];

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

    app.enableCors(corsOptions);

    const port = process.env.PORT_AUTH || 3005;
    await app.listen(port);
    console.log(`✅ Auth Service escutando na porta ${port}`);
  } catch (error) {
    console.error('❌ Erro durante bootstrap:', error);
  }
}

bootstrap();
