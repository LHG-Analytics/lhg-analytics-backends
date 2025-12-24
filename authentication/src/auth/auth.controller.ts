import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Get,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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

    // SOLUÇÃO IDEAL PARA SAME-DOMAIN:
    // Cookie httpOnly com sameSite: 'strict' = Máxima segurança
    // Funciona perfeitamente quando frontend e backend estão no mesmo domínio
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const cookieMaxAge =
      this.configService.get('JWT_EXPIRATION_TIME') === '1h'
        ? 3600000 // 1 hora em milissegundos
        : 3600000; // padrão 1 hora

    // Define cookie httpOnly com configurações ideais para same-domain
    res.cookie('access_token', access_token, {
      httpOnly: true, // ✅ Protege contra XSS - não acessível via JavaScript
      secure: isProduction, // ✅ Apenas HTTPS em produção
      sameSite: 'strict', // ✅ Proteção máxima contra CSRF (funciona em same-domain)
      maxAge: cookieMaxAge,
      path: '/',
    });

    // ✅ NÃO retorna token no body - apenas informações do usuário
    // Token está seguro no cookie httpOnly (não acessível via JS)
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        unit: user.unit,
        role: user.role,
      },
      message: 'Login realizado com sucesso',
    });
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  async logout(@Res() res: Response) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    // Remove o cookie httpOnly (mesmas configurações do login)
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction, // Mesmo do login
      sameSite: 'strict', // Mesmo do login
      path: '/',
    });

    return res.json({ message: 'Logout realizado com sucesso' });
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  async getCurrentUser(@Request() req: any) {
    // O usuário é populado automaticamente pelo JwtAuthGuard
    // através do JwtStrategy.validate()
    return {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      unit: req.user.unit,
      role: req.user.role,
    };
  }
}
