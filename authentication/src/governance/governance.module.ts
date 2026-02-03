/**
 * Módulo para KPIs unificados de Governance
 * Versão Multi-Tenant com conexão direta aos bancos
 */

import { Module, forwardRef } from '@nestjs/common';
import { GovernanceController } from './governance.controller';
import { GovernanceMultitenantService } from './governance-multitenant.service';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [forwardRef(() => CacheModule)],
  controllers: [GovernanceController],
  providers: [GovernanceMultitenantService],
  exports: [GovernanceMultitenantService],
})
export class GovernanceModule {}
