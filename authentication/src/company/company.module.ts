/**
 * Módulo para KPIs unificados de Company
 * Versão Multi-Tenant com conexão direta aos bancos
 */

import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyMultitenantService } from './company-multitenant.service';

@Module({
  controllers: [CompanyController],
  providers: [CompanyMultitenantService],
  exports: [CompanyMultitenantService],
})
export class CompanyModule {}
