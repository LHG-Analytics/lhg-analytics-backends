import { Global, Module } from '@nestjs/common';
import { TenantPoolService } from './tenant-pool.service';

@Global()
@Module({
  providers: [TenantPoolService],
  exports: [TenantPoolService],
})
export class DatabaseModule {}
