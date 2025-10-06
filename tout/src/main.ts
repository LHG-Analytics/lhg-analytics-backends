import 'module-alias/register';
import { addAliases } from 'module-alias';
import { join } from 'path';

// Verifica se o ambiente é de produção
if (process.env.NODE_ENV === 'production') {
  addAliases({
    '@client-local': join(__dirname, 'generated/client-local'),
    '@client-online': join(__dirname, 'generated/client-online'),
  });
}
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { ValidationPipe } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CreateKpiAlosDto } from './kpiAlos/dto/create-kpiAlos.dto';
import { UpdateKpiAlosDto } from './kpiAlos/dto/update-kpiAlos.dto';
import { CreateKpiRevenueDto } from './kpiRevenue/dto/create-kpiRevenue.dto';
import { UpdateKpiRevenueDto } from './kpiRevenue/dto/update-kpiRevenue.dto';
import helmet from 'helmet';

// Carregar variáveis de ambiente do arquivo .env
config();

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

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

    const servicePrefix = process.env.SERVICE_PREFIX_TOUT || 'tout';
    app.setGlobalPrefix(`${servicePrefix}/api`);
    const isProduction = process.env.NODE_ENV === 'production';

    // Configuração do Swagger
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LHG Analytics Backend - Tout')
      .setDescription('API para visualização e gerenciamento dos Endpoints no backend')
      .setVersion('1.0')
      //.addBearerAuth()
      .addServer(isProduction ? '/tout' : '/')
      .addTag('KpiAlos')
      .addTag('KpiRevenue')
      .addTag('KpiTotalRentals')
      .addTag('KpiTicketAverage')
      .addTag('KpiOccupancyRate')
      .addTag('KpiGiro')
      .addTag('KpiRevpar')
      .addTag('KpiTrevpar')
      .addTag('Cleanings')
      .addTag('Inspections')
      .addTag('BookingsRevenue')
      .addTag('BookingsTotalRentals')
      .addTag('BookingsTicketAverage')
      .addTag('BookingsRepresentativeness')
      .addTag('RestaurantRevenue')
      .addTag('RestaurantSales')
      .addTag('RestaurantTicketAverage')
      .addTag('Company')
      .addTag('Restaurants')
      .addTag('Governance')
      .addTag('Bookings')
      .addTag('CronJobs')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      extraModels: [CreateKpiAlosDto, UpdateKpiAlosDto, CreateKpiRevenueDto, UpdateKpiRevenueDto],
    });
    SwaggerModule.setup('tout/api', app, document);
    console.log('Swagger UI disponível em: /tout/api');

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
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'https://lhg-analytics.vercel.app', // Substitua pela URL do seu frontend
    ];

    const corsOptions: CorsOptions = {
      origin: (origin, callback) => {
        // Em produção, seja mais permissivo para evitar problemas com health checks e requests internos
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'production') {
          callback(null, true);
        } else {
          // Log da origem rejeitada para debug
          console.log('CORS rejeitou origem:', origin);
          callback(new Error('Not allowed by CORS'), false);
        }
      },
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: ['Authorization', 'Content-Type'], // Adicionando Authorization aqui
      credentials: true, // Se estiver enviando cookies, mantenha true
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

    const port = process.env.PORT_TOUT || 3003;

    // Use a porta do ambiente ou 3001 como padrão
    await app.listen(port, () => {
      console.log(`App listening on port ${port}`);
    });
  } catch (error) {
    console.error('Error during application bootstrap:', error);
  }
}
bootstrap();
