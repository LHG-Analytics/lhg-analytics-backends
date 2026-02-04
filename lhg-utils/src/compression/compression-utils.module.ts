import { DynamicModule, Module } from '@nestjs/common';
import { CompressionUtilsService } from './compression-utils.service';

/**
 * Módulo de compressão HTTP para respostas
 * Configura compressão gzip/brotli para reduzir tamanho das respostas em 60-80%
 */
@Module({
  providers: [CompressionUtilsService],
  exports: [CompressionUtilsService],
})
export class CompressionUtilsModule {
  static forRoot(): DynamicModule {
    return {
      module: CompressionUtilsModule,
      providers: [CompressionUtilsService],
      exports: [CompressionUtilsService],
    };
  }
}
