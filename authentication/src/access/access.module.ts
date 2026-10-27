import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';

// Global: login, refresh, me, helpdesk e cadastro usam a mesma regra de
// acesso ao Analytics e a mesma trilha de auditoria.
@Global()
@Module({
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
