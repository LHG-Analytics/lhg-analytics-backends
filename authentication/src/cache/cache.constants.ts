/**
 * Constantes para o sistema de cache de KPIs unificados
 */

import { CacheConfig, ServiceType } from './cache.interfaces';

// Prefixos por serviço para chaves de cache
export const SERVICE_PREFIXES: Record<ServiceType, string> = {
  bookings: 'bk',
  company: 'cp',
  restaurant: 'rt',
  governance: 'gv',
};

// Estratégia de TTL por período (em segundos)
// Otimizado para cache warmup diário às 6h via GitHub Actions
export const CACHE_STRATEGY: CacheConfig = {
  LAST_7_D: {
    ttl: 21600, // 6 horas - últimos 7 dias (até ontem)
    description: 'Últimos 7 dias',
  },
  LAST_MONTH: {
    ttl: 86400, // 24 horas - mês fechado, dados estáveis
    description: 'Último mês fechado',
  },
  YEAR_TO_DATE: {
    ttl: 86400, // 24 horas - dados históricos consolidados
    description: 'Acumulado do ano',
  },
  CUSTOM: {
    ttl: 600, // 10 minutos - consultas específicas (mantido curto)
    description: 'Período customizado',
  },
};

// Prefixo base para todas as chaves de cache
export const CACHE_KEY_PREFIX = 'unified_kpi';

// Tempo máximo de espera para operações de cache (ms)
export const CACHE_TIMEOUT = 5000;

// Tamanho máximo do cache em memória (número de itens)
export const MAX_CACHE_SIZE = 100;

// URLs dos backends das unidades
export const UNIT_BACKENDS = {
  lush_ipiranga: {
    url: process.env.LUSH_IPIRANGA_URL || 'http://localhost:3001',
    prefix: '/ipiranga/api',
    name: 'Lush Ipiranga',
  },
  lush_lapa: {
    url: process.env.LUSH_LAPA_URL || 'http://localhost:3002',
    prefix: '/lapa/api',
    name: 'Lush Lapa',
  },
  tout: {
    url: process.env.TOUT_URL || 'http://localhost:3003',
    prefix: '/tout/api',
    name: 'Tout',
  },
  andar_de_cima: {
    url: process.env.ANDAR_DE_CIMA_URL || 'http://localhost:3004',
    prefix: '/andar_de_cima/api',
    name: 'Andar de Cima',
  },
};

export type UnitKey = keyof typeof UNIT_BACKENDS;
