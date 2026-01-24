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

// Carregar variáveis de ambiente do arquivo .env
config();

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // Configuração de segurança com Helmet
    app.use(helmet());

    // Configuração do cookie-parser para ler cookies httpOnly
    app.use(cookieParser());

    const servicePrefix = process.env.SERVICE_PREFIX_IPIRANGA || 'ipiranga';
    app.setGlobalPrefix(`${servicePrefix}/api`);
    const isProduction = process.env.NODE_ENV === 'production';

    // Configuração do Swagger
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LHG Analytics Backend - Lush Ipiranga')
      .setDescription('API para visualização e gerenciamento dos Endpoints no backend')
      .setVersion('1.0')
      /*.addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT-auth',
      )*/
      .addServer(isProduction ? '/lush_ipiranga' : '/')
      .addTag('Auth')
      .addTag('Company')
      .addTag('Restaurants')
      .addTag('Bookings')
      .addTag('Governance')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('ipiranga/api', app, document);
    console.log('Swagger UI disponível em: /ipiranga/api');

    // Inicialize o PrismaService com tratamento de erro
    const prismaService = app.get(PrismaService);
    try {
      await prismaService.onModuleInit();
      console.log('Prisma conectado com sucesso.');
    } catch (error) {
      console.error('Erro ao conectar ao Prisma:', error);
      process.exit(1); // Encerrar o processo caso o banco não esteja acessível
    }

    // Configuração de CORS
    // Sempre inclui as origens padrão + qualquer origem adicional do .env
    const port = process.env.PORT_IPIRANGA || 3001;
    const defaultOrigins = [
      'https://lhg-analytics.vercel.app', // Frontend em produção
      'http://localhost:3000', // Proxy/Frontend local
      'http://localhost:3005', // Authentication service
      'http://localhost:3001', // Lush Ipiranga (Swagger)
      'http://localhost:3002', // Lush Lapa (Swagger)
      'http://localhost:3003', // Tout (Swagger)
      'http://localhost:3004', // Andar de Cima (Swagger)
    ];
    const envOrigins =
      process.env.ALLOWED_ORIGINS?.split(',')
        .map((o) => o.trim())
        .filter(Boolean) || [];
    const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

    const corsOptions: CorsOptions = {
      origin: (origin, callback) => {
        console.log('CORS - Origin recebida:', origin);
        console.log('CORS - Origens permitidas:', allowedOrigins);

        // Permite requisições sem origin (ex: Postman, curl, Swagger)
        if (!origin) {
          console.log('CORS - Permitindo requisição sem origin');
          callback(null, true);
          return;
        }

        // Verifica se a origin está na lista permitida
        if (allowedOrigins.includes(origin)) {
          console.log('CORS - Origin permitida');
          callback(null, true);
          return;
        }

        // Em produção, seja permissivo para health checks
        if (process.env.NODE_ENV === 'production') {
          console.log('CORS - Permitindo em produção');
          callback(null, true);
          return;
        }

        // Rejeita origem não permitida
        console.log('CORS - REJEITANDO origem:', origin);
        callback(new Error('Not allowed by CORS'), false);
      },
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: true,
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

    // Use a porta do ambiente ou 3001 como padrão
    await app.listen(port, () => {
      console.log(`App listening on port ${port}`);
    });
  } catch (error) {
    console.error('Error during application bootstrap:', error);
  }
}
bootstrap();
