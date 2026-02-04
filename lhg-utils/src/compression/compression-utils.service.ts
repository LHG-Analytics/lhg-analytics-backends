import { Injectable } from '@nestjs/common';
import * as compression from 'compression';

/**
 * Serviço de configuração de compressão HTTP
 * Fornece middleware de compressão e configurações otimizadas
 */
@Injectable()
export class CompressionUtilsService {
  /**
   * Retorna a configuração padrão de compressão
   * Pode ser usada com @nestx/compression ou express compression
   */
  getDefaultCompressionConfig() {
    return {
      // Filtra quais requisições devem ser comprimidas
      filter: (req: any, res: any) => {
        // Não comprimir se já tiver compressão
        if (req.headers['x-no-compression']) {
          return false;
        }

        // Comprimir apenas respostas JSON e HTML
        const type = res.getHeader('Content-Type');
        if (type) {
          return type.includes('application/json') ||
                 type.includes('text/html') ||
                 type.includes('text/plain') ||
                 type.includes('text/css') ||
                 type.includes('application/javascript');
        }

        return compression.filter(req, res);
      },
      // Só comprimir respostas maiores que 1KB
      threshold: 1024,
      // Nível de compressão (1-9, 6 é padrão - bom equilíbrio)
      level: 6,
      // Nível de memória (1-9, 8 é padrão)
      memLevel: 8,
      // Tipos que devem ser comprimidos
      filterTypes: [
        'application/json',
        'text/html',
        'text/plain',
        'text/css',
        'text/javascript',
        'application/javascript',
      ],
    };
  }

  /**
   * Retorna configuração leve para APIs com muitas requisições pequenas
   * Usa threshold menor e compressão mais leve
   */
  getLightCompressionConfig() {
    return {
      ...this.getDefaultCompressionConfig(),
      threshold: 512, // Comprimir desde 512 bytes
      level: 4, // Compressão mais leve (mais rápido)
    };
  }

  /**
   * Retorna configuração máxima para APIs com poucas requisições grandes
   * Máxima compressão, mas usa mais CPU
   */
  getMaximumCompressionConfig() {
    return {
      ...this.getDefaultCompressionConfig(),
      threshold: 256, // Comprimir desde 256 bytes
      level: 9, // Máxima compressão
    };
  }
}
