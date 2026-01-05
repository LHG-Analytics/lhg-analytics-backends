/**
 * Módulo para KPIs unificados de Governance
 * Versão Multi-Tenant com conexão direta aos bancos
 */

import { Module } from '@nestjs/common';
import { GovernanceController } from './governance.controller';
import { GovernanceMultitenantService } from './governance-multitenant.service';

@Module({
  controllers: [GovernanceController],
  providers: [GovernanceMultitenantService],
  exports: [GovernanceMultitenantService],
})
export class GovernanceModule {}
