import { forwardRef, Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';

@Module({
  imports: [forwardRef(() => CacheModule)],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
