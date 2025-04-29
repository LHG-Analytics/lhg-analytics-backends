import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Criação de usuário com validação de email
  async create(data: any) {
    // Verifica se o usuário já existe com o email fornecido
    const existingUser = await this.prisma.prismaOnline.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException("O usuário com este email já existe");
    }

    // Criptografa a senha antes de salvar
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.prismaOnline.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });

    return user;
  }

  // Buscar todos os usuários
  async findAll() {
    return this.prisma.prismaOnline.user.findMany();
  }

  // Buscar usuário por email com validação
  async findByEmail(email: string) {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException("Usuário não encontrado");
    }

    return user;
  }

  // Buscar usuário por ID com validação
  async findById(id: number) {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException("Usuário não encontrado");
    }

    return user;
  }

  // Atualizar usuário com validação de senha
  async update(id: number, data: any) {
    const user = await this.findById(id); // Verifica se o usuário existe

    // Se a senha for fornecida, criptografa antes de atualizar
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.prismaOnline.user.update({
      where: { id },
      data: { ...user, ...data },
    });
  }

  // Remover usuário com validação e mensagem de sucesso
  async remove(id: number) {
    const user = await this.findById(id); // Verifica se o usuário existe

    await this.prisma.prismaOnline.user.delete({
      where: { id },
    });

    return { message: `Usuário ${user.email} excluído com sucesso` }; // Mensagem de sucesso
  }
}
