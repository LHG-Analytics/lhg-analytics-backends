import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { PrismaService } from "./prisma/prisma.service";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    app.setGlobalPrefix("auth/api"); // Prefixo da API de autenticação

    // Habilitar CORS
    app.enableCors({
      origin: "*", // Ajuste se precisar liberar somente seu front
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
      credentials: true,
    });

    // ValidationPipe global para validar DTOs automaticamente
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );

    // Swagger (documentação automática da API)
    const swaggerConfig = new DocumentBuilder()
      .setTitle("LHG Analytics - Auth Service")
      .setDescription(
        "Serviço de autenticação e gerenciamento de usuários do grupo LHG"
      )
      .setVersion("1.0")
      .addBearerAuth() // Permite autenticar endpoints no Swagger
      .addTag("Auth")
      .addTag("Users")
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("auth/api", app, document);
    console.log("Swagger UI disponível em: /auth/api");

    // Inicializar conexão do Prisma
    const prismaService = app.get(PrismaService);
    try {
      await prismaService.onModuleInit();
      console.log("Prisma conectado com sucesso.");
    } catch (error) {
      console.error("Erro ao conectar ao Prisma:", error);
      process.exit(1);
    }

    const port = process.env.PORT_AUTH || 3005;
    await app.listen(port);
    console.log(`Auth Service escutando na porta ${port}`);
  } catch (error) {
    console.error("Erro durante bootstrap:", error);
    process.exit(1);
  }
}

bootstrap();
