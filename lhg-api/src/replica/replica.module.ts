import { Module } from '@nestjs/common';
import { ReplicaController } from './replica.controller';
import { ReplicaService } from './replica.service';

/** Vigia das réplicas do Automo: aviso por e-mail e "dados até…" nas telas. (Cache e pools são globais.) */
@Module({
  controllers: [ReplicaController],
  providers: [ReplicaService],
})
export class ReplicaModule {}
