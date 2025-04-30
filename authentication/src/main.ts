import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

// Carregar variáveis de ambiente do arquivo .env
config();

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    app.setGlobalPrefix(`/api`);
    const isProduction = process.env.NODE_ENV === 'production';

    // Configuração do Swagger
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LHG Analytics - Auth Service')
      .setDescription(
        'Serviço de autenticação e gerenciamento de usuários do grupo LHG',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'JWT-auth',
      ) // Permite autenticar endpoints no Swagger
      .addServer(isProduction ? '' : '/')
      .addTag('Auth')
      .addTag('Users')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('/api', app, document);
    console.log('Swagger UI disponível em: /api');

    // Inicialize o PrismaService com tratamento de erro
    const prismaService = app.get(PrismaService);
    try {
      await prismaService.onModuleInit();
      console.log('Prisma conectado com sucesso.');
    } catch (error) {
      console.error('Erro ao conectar ao Prisma:', error);
      process.exit(1); // Encerrar o processo caso o banco não esteja acessível
    }

    console.log('JWT_SECRET:', process.env.JWT_SECRET);

    // Configuração de CORS
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://lhg-analytics-backend-bmmd.onrender.com',
      'http://localhost:3005', // Adicionando origem do frontend localmente
      'https://lhg-analytics.vercel.app', // Substitua com a URL do seu frontend
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
      allowedHeaders: ['Authorization', 'Content-Type'], // Certifique-se de incluir Authorization
      credentials: true, // Se estiver enviando cookies, mantenha true
    };

    app.enableCors(corsOptions);

    // ValidationPipe global para validar DTOs automaticamente
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const port = process.env.PORT_AUTH || 3005;
    await app.listen(port);
    console.log(`Auth Service escutando na porta ${port}`);
  } catch (error) {
    console.error('Erro durante bootstrap:', error);
  }
}

bootstrap();
