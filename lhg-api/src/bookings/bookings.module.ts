import { forwardRef, Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [forwardRef(() => CacheModule)],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
