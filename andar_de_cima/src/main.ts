import 'module-alias/register';
import { addAliases } from 'module-alias';
import { join } from 'path';

// Verifica se o ambiente é de produção
if (process.env.NODE_ENV === 'production') {
  addAliases({
    '@client-local': join(__dirname, 'generated/client-local'),
    '@auth/auth/auth.service': join(__dirname, '../../../../authentication/dist/auth/auth.service'),
    '@auth/prisma/prisma.service': join(
      __dirname,
      '../../../../authentication/dist/prisma/prisma.service',
    ),
    '@auth/auth/interfaces/jwt-payload.interface': join(
      __dirname,
      '../../../../authentication/dist/auth/interfaces/jwt-payload.interface',
    ),
  });
}
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { ValidationPipe } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';

// Carregar variáveis de ambiente do arquivo .env
config();

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // Configuração de compressão HTTP
    app.use(compression());

    // Configuração de segurança com Helmet
    app.use(helmet());

    // Configuração do cookie-parser para ler cookies httpOnly
    app.use(cookieParser());

    const servicePrefix = process.env.SERVICE_PREFIX_ANDAR_DE_CIMA || 'andar_de_cima';
    app.setGlobalPrefix(`${servicePrefix}/api`);
    const isProduction = process.env.NODE_ENV === 'production';

    // Configuração do Swagger
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LHG Analytics Backend - Andar de Cima')
      .setDescription('API para visualização e gerenciamento dos Endpoints no backend')
      .setVersion('1.0')
      //.addBearerAuth()
      .addServer(isProduction ? '/andar_de_cima' : '/')
      .addTag('Auth')
      .addTag('Company')
      .addTag('Restaurants')
      .addTag('Governance')
      .addTag('Bookings')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('andar_de_cima/api', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
        syntaxHighlight: {
          activate: true,
          theme: 'monokai',
        },
      },
      customSiteTitle: 'LHG Analytics - Andar de Cima',
    });
    console.log('Swagger UI disponível em: /andar_de_cima/api');

    // Inicialize o PrismaService com tratamento de erro
    const prismaService = app.get(PrismaService);
    try {
      await prismaService.onModuleInit();
      console.log('Prisma conectado com sucesso.');
    } catch (error) {
      console.error('Erro ao conectar ao Prisma:', error);
      process.exit(1); // Encerrar o processo caso o banco não esteja acessível
    }

    // Configuração de CORS - Padronizada
    const port = process.env.PORT_ANDAR_DE_CIMA || 3004;
    const defaultOrigins = [
      'https://lhg-analytics.vercel.app', // Frontend em produção
      'http://localhost:3000', // Proxy/Frontend local
      'http://localhost:3005', // Authentication service
      'http://localhost:3001', // Lush Ipiranga (Swagger)
      'http://localhost:3002', // Lush Lapa (Swagger)
      'http://localhost:3003', // Tout (Swagger)
      'http://localhost:3004', // Andar de Cima (Swagger)
      'http://localhost:3006', // Liv (Swagger)
    ];
    const envOrigins =
      process.env.ALLOWED_ORIGINS?.split(',')
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
    const allowedOrigins = [
      ...new Set([...defaultOrigins, ...envOrigins, ...(serverUrl ? [serverUrl] : [])]),
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

        // Log apenas em desenvolvimento
        if (process.env.NODE_ENV !== 'production') {
          console.warn('CORS rejeitou origem:', origin);
        }

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

    // Use a porta do ambiente ou 3004 como padrão
    await app.listen(port, () => {
      console.log(`App listening on port ${port}`);
    });
  } catch (error) {
    console.error('Error during application bootstrap:', error);
  }
}
bootstrap();
