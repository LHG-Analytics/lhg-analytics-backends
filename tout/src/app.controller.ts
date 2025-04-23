import { Controller, Get, Redirect } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Redirect('/api', 302) // Redireciona para a interface do Swagger
  getHello(): string {
    return this.appService.getHello(); // Este método não será mais chamado devido ao redirecionamento
  }
}
