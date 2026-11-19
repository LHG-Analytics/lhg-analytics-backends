import { Module } from '@nestjs/common';
import { PainelController } from './painel.controller';
import { PainelService } from './painel.service';

/** Resumo enxuto do Painel TV (usa o TenantPoolService global do DatabaseModule). */
@Module({
  controllers: [PainelController],
  providers: [PainelService],
})
export class PainelModule {}
