import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import helmet from 'helmet';

config();

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // Configuração de segurança com Helmet
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

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

    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://lhg-analytics-backend-bmmd.onrender.com',
      'http://localhost:3005',
      'https://lhg-analytics.vercel.app',
    ];

    const corsOptions: CorsOptions = {
      origin: (origin, callback) => {
        if (
          !origin ||
          allowedOrigins.includes(origin) ||
          origin.startsWith('https://lhg-analytics')
        ) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'), false);
        }
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

    const port = process.env.PORT_AUTH || 3005;
    await app.listen(port);
    console.log(`✅ Auth Service escutando na porta ${port}`);
  } catch (error) {
    console.error('❌ Erro durante bootstrap:', error);
  }
}

bootstrap();
