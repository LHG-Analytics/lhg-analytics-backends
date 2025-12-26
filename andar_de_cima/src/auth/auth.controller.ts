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
  constructor(
    private readonly authService: AuthService,
    private readonly prismaAuthService: PrismaAuthService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Fazer login no sistema' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    try {
      // Validar usuário
      const user = await this.authService.validateUser(loginDto.email, loginDto.password);

      // Gerar token
      const result = await this.authService.login(user);

      // Configurar o cookie httpOnly com o token JWT
      response.cookie('access_token', result.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600000, // 1 hora
      });

      return {
        message: 'Login realizado com sucesso',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          unit: user.unit,
          role: user.role,
        },
      };
    } catch (error) {
      return response.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Credenciais inválidas',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Fazer logout do sistema' })
  @ApiResponse({ status: 200, description: 'Logout realizado com sucesso' })
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('access_token');
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
