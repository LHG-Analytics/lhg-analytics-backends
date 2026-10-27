import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { emailInUse, isEmailConflict, normalizeEmail } from '../common/email';

// Sistema cuja flag o cadastro pelo Analytics concede.
const ANALYTICS = 'analytics';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Criação de usuário com validação de email. A pessoa nasce com a flag
  // do Analytics (na mesma transação), quem a criou fica como grantedById.
  async create(data: any, actorId?: number) {
    const email = normalizeEmail(data.email);

    // Um e-mail pertence a uma pessoa só: principal OU secundário de alguém.
    const [existingUser, existingSecondary] = await Promise.all([
      this.prisma.prismaOnline.user.findUnique({ where: { email } }),
      this.prisma.prismaOnline.userEmail.findUnique({ where: { email } }),
    ]);

    if (existingUser || existingSecondary) {
      throw emailInUse();
    }

    // Criptografa a senha antes de salvar
    const hashedPassword = await bcrypt.hash(data.password, 10);
    try {
      return await this.prisma.prismaOnline.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            ...data,
            email,
            password: hashedPassword,
          },
        });
        await tx.systemAccess.create({
          data: {
            userId: user.id,
            systemKey: ANALYTICS,
            grantedById: actorId ?? null,
          },
        });
        return user;
      });
    } catch (error) {
      // Corrida com outro cadastro do mesmo e-mail (unique/trigger do banco).
      if (isEmailConflict(error)) throw emailInUse();
      throw error;
    }
  }

  async findAll() {
    try {
      const users = await this.prisma.prismaOnline.user.findMany();
      return users;
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      throw new Error('Erro ao buscar usuários');
    }
  }

  // Buscar usuário por email com validação
  async findByEmail(email: string) {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { email: normalizeEmail(email) },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  // Buscar usuário por ID com validação
  async findById(id: number) {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
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
    if (typeof data.email === 'string') {
      data.email = normalizeEmail(data.email);
    }

    try {
      return await this.prisma.prismaOnline.user.update({
        where: { id },
        data: { ...user, ...data },
      });
    } catch (error) {
      if (isEmailConflict(error)) throw emailInUse();
      throw error;
    }
  }

  // Remover usuário com validação e mensagem de sucesso. Os acessos e e-mails
  // secundários da pessoa saem junto (ON DELETE CASCADE no banco).
  async remove(id: number) {
    const user = await this.findById(id); // Verifica se o usuário existe

    await this.prisma.prismaOnline.user.delete({
      where: { id },
    });

    return { message: `Usuário ${user.email} excluído com sucesso` }; // Mensagem de sucesso
  }
}
