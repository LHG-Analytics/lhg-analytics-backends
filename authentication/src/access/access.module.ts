import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { LoginLockService } from './login-lock.service';

// Global: login, refresh, me, helpdesk e cadastro usam a mesma regra de
// acesso ao Analytics, o mesmo bloqueio por tentativas e a mesma auditoria.
@Global()
@Module({
  providers: [AccessService, LoginLockService],
  exports: [AccessService, LoginLockService],
})
export class AccessModule {}
