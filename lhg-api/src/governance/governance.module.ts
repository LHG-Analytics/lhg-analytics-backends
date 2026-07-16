import { forwardRef, Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports: [forwardRef(() => CacheModule)],
  controllers: [GovernanceController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
