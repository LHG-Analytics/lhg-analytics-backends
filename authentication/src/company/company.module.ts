/**
 * Módulo para KPIs unificados de Company
 * Versão Multi-Tenant com conexão direta aos bancos
 */

import { Module, forwardRef } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyMultitenantService } from './company-multitenant.service';
import { CompanyService } from './company.service';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [forwardRef(() => CacheModule)],
  controllers: [CompanyController],
  providers: [CompanyMultitenantService, CompanyService],
  exports: [CompanyMultitenantService, CompanyService],
})
export class CompanyModule {}
