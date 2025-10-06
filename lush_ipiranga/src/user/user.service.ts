import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthService } from '../auth/auth.service';
import { User, UserResponse } from './entities/user.entity';
import { cpf } from 'cpf-cnpj-validator';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    public authService: AuthService,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserResponse> {
    if (!cpf.isValid(createUserDto.cpf)) {
      throw new BadRequestException('CPF inválido');
    }

    // Hash da senha do usuário
    const hashedPassword = await this.authService.hashPassword(createUserDto.password);

    // Criar o usuário no banco de dados online
    await this.prisma.prismaOnline.user.create({
      data: {
        email: createUserDto.email,
        name: createUserDto.name,
        cpf: createUserDto.cpf,
        password: hashedPassword,
        role: createUserDto.role,
        company: createUserDto.company,
      },
    });

    return {
      email: createUserDto.email,
      name: createUserDto.name,
      cpf: createUserDto.cpf,
      role: createUserDto.role,
      company: createUserDto.company,
    };
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<UserResponse> {
    await this.findUserById(id);

    // Verificar se o CPF é válido
    if (updateUserDto.cpf && !cpf.isValid(updateUserDto.cpf)) {
      throw new BadRequestException('CPF inválido');
    }

    // Somente encripta a senha se um novo valor for fornecido
    if (updateUserDto.password) {
      updateUserDto.password = await this.authService.hashPassword(updateUserDto.password);
    } else {
      // Se o password estiver vazio, remove do updateUserDto para não sobrescrever
      delete updateUserDto.password;
    }

    const updatedUser = await this.prisma.prismaOnline.user.update({
      where: { id },
      data: updateUserDto,
    });

    // Temporarily include password for frontend compatibility
    // TODO: Remove password from response when frontend is updated
    // const { password, ...userResponse } = updatedUser;
    return updatedUser;
  }

  async findAll(): Promise<UserResponse[]> {
    try {
      const users = await this.prisma.prismaOnline.user.findMany();

      // Temporarily include password for frontend compatibility
      // TODO: Remove password from response when frontend is updated
      const usersWithCompanyNames = await Promise.all(
        users.map(async (user) => {
          // const { password, ...userWithoutPassword } = user;
          return {
            id: user.id,
            name: user.name,
            cpf: user.cpf,
            role: user.role,
            email: user.email,
            company: user.company,
            password: user.password,
          };
        }),
      );

      return usersWithCompanyNames;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch users: ${error.message}`);
      }
      throw new Error('Failed to fetch users: erro desconhecido');
    }
  }

  async findUserById(id: number): Promise<UserResponse> {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Temporarily include password for frontend compatibility
    // TODO: Remove password from response when frontend is updated
    // const { password, ...userResponse } = user;
    return user;
  }

  async findByEmail(email: string): Promise<UserResponse> {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    // Temporarily include password for frontend compatibility
    // TODO: Remove password from response when frontend is updated
    // const { password, ...userResponse } = user;
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    await this.findUserById(id);

    await this.prisma.prismaOnline.user.delete({
      where: { id },
    });
  }
}
