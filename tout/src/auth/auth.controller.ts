import { Controller, Post, Get, Body, Res, Req, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from '@auth/auth/auth.service';
import { PrismaService as PrismaAuthService } from '@auth/prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly ACCESS_TOKEN_MAX_AGE = 3600000; // 1 hora em ms
  private readonly REFRESH_TOKEN_MAX_AGE = 7 * 24 * 3600000; // 7 dias em ms

  constructor(
    private readonly authService: AuthService,
    private readonly prismaAuthService: PrismaAuthService,
  ) {}

  private getCookieConfig() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Fazer login no sistema' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    try {
      // Validar usuário
      const user = await this.authService.validateUser(loginDto.email, loginDto.password);

      // Gerar tokens
      const result = await this.authService.login(user);
      const cookieConfig = this.getCookieConfig();

      // Access token - expira em 1h
      response.cookie('access_token', result.access_token, {
        ...cookieConfig,
        maxAge: this.ACCESS_TOKEN_MAX_AGE,
      });

      // Refresh token - expira em 7 dias
      response.cookie('refresh_token', result.refresh_token, {
        ...cookieConfig,
        maxAge: this.REFRESH_TOKEN_MAX_AGE,
      });

      // Calcula quando o access token expira
      const expiresAt = new Date(Date.now() + this.ACCESS_TOKEN_MAX_AGE).toISOString();

      return {
        message: 'Login realizado com sucesso',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          unit: user.unit,
          role: user.role,
        },
        expiresAt,
      };
    } catch (error) {
      return response.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Credenciais inválidas',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Renovar tokens de autenticação' })
  @ApiResponse({ status: 200, description: 'Tokens renovados com sucesso' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido ou expirado' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = (request as any).cookies?.refresh_token;

    if (!refreshToken) {
      return response.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Refresh token não encontrado',
      });
    }

    try {
      const result = await this.authService.refreshTokens(refreshToken);
      const cookieConfig = this.getCookieConfig();

      // Novos tokens
      response.cookie('access_token', result.access_token, {
        ...cookieConfig,
        maxAge: this.ACCESS_TOKEN_MAX_AGE,
      });

      response.cookie('refresh_token', result.refresh_token, {
        ...cookieConfig,
        maxAge: this.REFRESH_TOKEN_MAX_AGE,
      });

      // Calcula quando o novo access token expira
      const expiresAt = new Date(Date.now() + this.ACCESS_TOKEN_MAX_AGE).toISOString();

      return {
        user: result.user,
        message: 'Tokens renovados com sucesso',
        expiresAt,
      };
    } catch {
      const cookieConfig = this.getCookieConfig();
      response.clearCookie('access_token', cookieConfig);
      response.clearCookie('refresh_token', cookieConfig);

      return response.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Sessão expirada. Faça login novamente.',
      });
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Fazer logout do sistema' })
  @ApiResponse({ status: 200, description: 'Logout realizado com sucesso' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = (request as any).cookies?.refresh_token;
    const cookieConfig = this.getCookieConfig();

    // Invalida o refresh token no banco
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Remove os cookies
    response.clearCookie('access_token', cookieConfig);
    response.clearCookie('refresh_token', cookieConfig);

    return { message: 'Logout realizado com sucesso' };
  }

  @Get('me')
  @ApiOperation({ summary: 'Obter dados do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Dados do usuário retornados com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() request: Request) {
    return request.user;
  }

  @Get('users')
  @ApiOperation({ summary: 'Listar todos os usuários (apenas ADMIN)' })
  @ApiResponse({ status: 200, description: 'Lista de usuários retornada com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Acesso negado - Apenas ADMIN' })
  @UseGuards(JwtAuthGuard)
  async getAllUsers(@Req() request: any) {
    // Apenas ADMIN pode listar todos os usuários
    if (request.user.role !== 'ADMIN') {
      return {
        message: 'Acesso negado',
        statusCode: HttpStatus.FORBIDDEN,
      };
    }

    try {
      const users = await this.prismaAuthService.prismaOnline.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          unit: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return users;
    } catch (error) {
      return {
        message: 'Erro ao buscar usuários',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }
}
