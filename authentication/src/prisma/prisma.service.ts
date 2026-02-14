import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient as PrismaClientOnline } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  prismaOnline: PrismaClientOnline;

  constructor() {
    this.prismaOnline = new PrismaClientOnline();
  }

  async onModuleInit() {
    await this.prismaOnline.$connect();
  }

  async onModuleDestroy() {
    await this.prismaOnline.$disconnect();
  }

  async executeQuery(query: () => Promise<any>): Promise<any> {
    try {
      return await query();
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }
}
