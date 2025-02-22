import { Module } from '@nestjs/common';
import { ApartmentInspectionService } from './apartment-inspection.service';
import { ApartmentInspectionController } from './apartment-inspection.controller';

@Module({
  controllers: [ApartmentInspectionController],
  providers: [ApartmentInspectionService],
  exports: [ApartmentInspectionService],
})
export class ApartmentInspectionModule {}
