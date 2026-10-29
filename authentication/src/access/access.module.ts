import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { LauncherService } from './launcher.service';
import { LoginLockService } from './login-lock.service';
import { MeController } from './me.controller';

// Global: login, refresh, me, helpdesk e cadastro usam a mesma regra de
// acesso ao Analytics, o mesmo bloqueio por tentativas e a mesma auditoria.
// Também serve o launcher do HUB (GET /api/me/systems).
@Global()
@Module({
  controllers: [MeController],
  providers: [AccessService, LoginLockService, LauncherService],
  exports: [AccessService, LoginLockService, LauncherService],
})
export class AccessModule {}
