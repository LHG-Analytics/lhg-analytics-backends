/**
 * Constantes para o sistema de cache de KPIs
 * Fase 1.4 do plano de migração real-time
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
export const CACHE_STRATEGY: CacheConfig = {
  LAST_7_D: {
    ttl: 1800, // 30 minutos - dados mudam frequentemente
    description: 'Últimos 7 dias',
  },
  LAST_MONTH: {
    ttl: 3600, // 1 hora - mês fechado, mais estável
    description: 'Último mês fechado',
  },
  YEAR_TO_DATE: {
    ttl: 7200, // 2 horas - dados históricos consolidados
    description: 'Acumulado do ano',
  },
  CUSTOM: {
    ttl: 600, // 10 minutos - consultas específicas
    description: 'Período customizado',
  },
};

// Prefixo base para todas as chaves de cache
export const CACHE_KEY_PREFIX = 'kpi';

// Tempo máximo de espera para operações de cache (ms)
export const CACHE_TIMEOUT = 5000;

// Tamanho máximo do cache em memória (número de itens)
export const MAX_CACHE_SIZE = 100;
