import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Request,
} from '@nestjs/common';
import { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('Auth')
@Controller()
export class AuthController {
  private readonly ACCESS_TOKEN_MAX_AGE = 3600000; // 1 hora em ms
  private readonly REFRESH_TOKEN_MAX_AGE = 7 * 24 * 3600000; // 7 dias em ms

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCookieConfig(isProduction: boolean) {
    const config: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'strict' | 'lax' | 'none';
      path: string;
      domain?: string;
    } = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'lax' : 'lax', // 'lax' permite envio em navegação cross-site
      path: '/',
    };

    // Em produção, define o domínio para compartilhar cookies entre subdomínios
    // Ex: .seudominio.com.br permite auth.seudominio.com.br e api.seudominio.com.br
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');
    if (cookieDomain) {
      config.domain = cookieDomain;
    }

    return config;
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    const { access_token, refresh_token } = await this.authService.login(user);

    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const cookieConfig = this.getCookieConfig(isProduction);

    // Access token - expira em 1h
    res.cookie('access_token', access_token, {
      ...cookieConfig,
      maxAge: this.ACCESS_TOKEN_MAX_AGE,
    });

    // Refresh token - expira em 7 dias
    res.cookie('refresh_token', refresh_token, {
      ...cookieConfig,
      maxAge: this.REFRESH_TOKEN_MAX_AGE,
    });

    // Calcula quando o access token expira
    const expiresAt = new Date(Date.now() + this.ACCESS_TOKEN_MAX_AGE).toISOString();

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        unit: user.unit,
        role: user.role,
      },
      message: 'Login realizado com sucesso',
      expiresAt,
    });
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: ExpressRequest, @Res() res: Response) {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Refresh token não encontrado',
      });
    }

    try {
      const { access_token, refresh_token, user } =
        await this.authService.refreshTokens(refreshToken);

      const isProduction = this.configService.get('NODE_ENV') === 'production';
      const cookieConfig = this.getCookieConfig(isProduction);

      // Novos tokens
      res.cookie('access_token', access_token, {
        ...cookieConfig,
        maxAge: this.ACCESS_TOKEN_MAX_AGE,
      });

      res.cookie('refresh_token', refresh_token, {
        ...cookieConfig,
        maxAge: this.REFRESH_TOKEN_MAX_AGE,
      });

      // Calcula quando o novo access token expira
      const expiresAt = new Date(Date.now() + this.ACCESS_TOKEN_MAX_AGE).toISOString();

      return res.json({
        user,
        message: 'Tokens renovados com sucesso',
        expiresAt,
      });
    } catch {
      // Limpa os cookies em caso de erro
      const isProduction = this.configService.get('NODE_ENV') === 'production';
      const cookieConfig = this.getCookieConfig(isProduction);

      res.clearCookie('access_token', cookieConfig);
      res.clearCookie('refresh_token', cookieConfig);

      return res.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Sessão expirada. Faça login novamente.',
      });
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: ExpressRequest, @Res() res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const cookieConfig = this.getCookieConfig(isProduction);

    // Invalida o refresh token no banco
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Remove os cookies
    res.clearCookie('access_token', cookieConfig);
    res.clearCookie('refresh_token', cookieConfig);

    return res.json({ message: 'Logout realizado com sucesso' });
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  async getCurrentUser(@Request() req: any) {
    // Converte o exp do JWT (segundos desde epoch) para ISO string
    const expiresAt = req.user.exp
      ? new Date(req.user.exp * 1000).toISOString()
      : null;

    return {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      unit: req.user.unit,
      role: req.user.role,
      expiresAt,
    };
  }
}
