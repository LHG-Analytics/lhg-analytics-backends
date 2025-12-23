import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';

@ApiTags('Auth')
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 login attempts per minute
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    const { access_token } = await this.authService.login(user);

    // Configurações do cookie httpOnly (mais seguro)
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const cookieMaxAge =
      this.configService.get('JWT_EXPIRATION_TIME') === '1h'
        ? 3600000 // 1 hora em milissegundos
        : 3600000; // padrão 1 hora

    // Define o cookie httpOnly com configurações de segurança
    res.cookie('access_token', access_token, {
      httpOnly: true, // Protege contra XSS - não acessível via JavaScript
      secure: isProduction, // Apenas HTTPS em produção
      sameSite: 'strict', // Protege contra CSRF
      maxAge: cookieMaxAge,
      path: '/',
    });

    // Retorna o token também no body para compatibilidade (opcional)
    // Em produção, considere remover isso e usar apenas cookies
    return res.json({
      access_token,
      message: 'Login realizado com sucesso',
    });
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  async logout(@Res() res: Response) {
    // Remove o cookie httpOnly
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return res.json({ message: 'Logout realizado com sucesso' });
  }
}
