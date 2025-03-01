import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthService } from '../auth/auth.service';
import { User } from './entities/user.entity';
import { cpf } from 'cpf-cnpj-validator';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    public authService: AuthService,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    if (!cpf.isValid(createUserDto.cpf)) {
      throw new BadRequestException('CPF inválido');
    }

    // Hash da senha do usuário
    const hashedPassword = await this.authService.hashPassword(
      createUserDto.password,
    );

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
      password: hashedPassword,
      role: createUserDto.role,
      company: createUserDto.company,
    };
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    await this.findUserById(id);

    // Verificar se o CPF é válido
    if (updateUserDto.cpf && !cpf.isValid(updateUserDto.cpf)) {
      throw new BadRequestException('CPF inválido');
    }

    // Somente encripta a senha se um novo valor for fornecido
    if (updateUserDto.password) {
      updateUserDto.password = await this.authService.hashPassword(
        updateUserDto.password,
      );
    } else {
      // Se o password estiver vazio, remove do updateUserDto para não sobrescrever
      delete updateUserDto.password;
    }

    const updatedUser = await this.prisma.prismaOnline.user.update({
      where: { id },
      data: updateUserDto,
    });

    return {
      ...updatedUser,
    };
  }

  async findAll(): Promise<User[]> {
    try {
      const users = await this.prisma.prismaOnline.user.findMany();

      // Mapeia os usuários e busca o nome da empresa associada
      const usersWithCompanyNames = await Promise.all(
        users.map(async (user) => {
          return {
            id: user.id,
            name: user.name,
            cpf: user.cpf,
            password: user.password,
            role: user.role,
            email: user.email,
            company: user.company,
          };
        }),
      );

      return usersWithCompanyNames;
    } catch (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
  }

  async findUserById(id: number): Promise<User> {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      password: user.password,
      role: user.role,
      email: user.email,
      company: user.company,
    };
  }

  async findByEmail(email: string): Promise<User> {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    return {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      password: user.password,
      role: user.role,
      email: user.email,
      company: user.company,
    };
  }

  async deleteUser(id: number): Promise<void> {
    await this.findUserById(id);

    await this.prisma.prismaOnline.user.delete({
      where: { id },
    });
  }
}
