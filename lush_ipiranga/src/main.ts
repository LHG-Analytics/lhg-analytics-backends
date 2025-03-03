import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CreateKpiAlosDto } from './kpiAlos/dto/create-kpiAlos.dto';
import { UpdateKpiAlosDto } from './kpiAlos/dto/update-kpiAlos.dto';
import { CreateKpiRevenueDto } from './kpiRevenue/dto/create-kpiRevenue.dto';
import { UpdateKpiRevenueDto } from './kpiRevenue/dto/update-kpiRevenue.dto';

// Carregar variáveis de ambiente do arquivo .env
config();

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);
    app.use((req, res, next) => {
      console.log('Headers antes de qualquer middleware:', req.headers);
      next();
    });

    const servicePrefix = process.env.SERVICE_PREFIX_IPIRANGA || 'ipiranga';
    app.setGlobalPrefix(`${servicePrefix}/api`);
    const isProduction = process.env.NODE_ENV === 'production';

    // Configuração do Swagger
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LHG Analytics Backend - Lush Ipiranga')
      .setDescription(
        'API para visualização e gerenciamento dos Endpoints no backend',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addServer(isProduction ? '/lush_ipiranga' : '/')
      .addTag('users')
      .addTag('KpiAlos')
      .addTag('KpiRevenue')
      .addTag('KpiTotalRentals')
      .addTag('KpiTicketAverage')
      .addTag('KpiOccupancyRate')
      .addTag('KpiGiro')
      .addTag('KpiRevpar')
      .addTag('KpiTrevpar')
      .addTag('Company')
      .addTag('Governance')
      .addTag('Cleanings')
      .addTag('Inspections')
      .addTag('CronJobs')
      .addTag('BookingsRevenue')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      extraModels: [
        CreateKpiAlosDto,
        UpdateKpiAlosDto,
        CreateKpiRevenueDto,
        UpdateKpiRevenueDto,
      ],
    });
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
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'https://lhg-analytics.vercel.app/',
    ];

    const corsOptions: CorsOptions = {
      origin: allowedOrigins,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      //credentials: true, // Se estiver enviando cookies, mantenha true
      allowedHeaders: ['Authorization', 'Content-Type'], //Adicionando Authorization aqui
    };

    app.enableCors(corsOptions);

    const port = process.env.PORT_IPIRANGA || 3001;

    // Use a porta do ambiente ou 3001 como padrão
    await app.listen(port, () => {
      console.log(`App listening on port ${port}`);
    });
  } catch (error) {
    console.error('Error during application bootstrap:', error);
  }
}
bootstrap();
