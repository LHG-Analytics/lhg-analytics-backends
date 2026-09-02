/**
 * Cache de KPIs multi-tenant.
 * A UNIDADE faz parte da chave lógica — um único processo cacheia todas as unidades.
 * Chave lógica: kpi:{unit}:{svcPrefix}:{period}[:start:end]
 *
 * Backend duplo:
 *  - Se REDIS_URL estiver setado, usa Redis (ioredis) — o cache SOBREVIVE a deploys
 *    e é compartilhado entre processos. As chaves físicas ganham um prefixo de
 *    ambiente (CACHE_PREFIX → ex. "prod"/"dev") para dev e prod poderem dividir o
 *    MESMO Redis sem se misturarem.
 *  - Se REDIS_URL faltar OU o Redis cair, cai automaticamente no Map em memória
 *    (comportamento antigo). O Redis NUNCA derruba a aplicação: qualquer erro faz
 *    fallback e a request segue calculando normalmente.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as moment from 'moment-timezone';
import Redis from 'ioredis';
import {
  CacheItem,
  CachePeriodEnum,
  CacheResult,
  DateRange,
  ServiceType,
} from './cache.interfaces';
import { allTenants } from '../tenant/tenant.registry';

const SERVICE_PREFIXES: Record<ServiceType, string> = {
  bookings: 'bk',
  company: 'cp',
  restaurant: 'rt',
  governance: 'gv',
};

const CACHE_KEY_PREFIX = 'kpi';
// Dimensionado pelo registry: (unidades + consolidated + folga) × 4 serviços × ~15 slots.
// Escala sozinho quando novas unidades (Goiânia) entrarem no tenant registry.
// (só usado no fallback em memória — o Redis expira sozinho via TTL nativo)
const MAX_CACHE_SIZE = Math.max(480, (allTenants().length + 2) * 60);

const PERIOD_TTL: Record<CachePeriodEnum, number> = {
  [CachePeriodEnum.LAST_7_D]: 21600,
  [CachePeriodEnum.LAST_MONTH]: 86400,
  [CachePeriodEnum.YEAR_TO_DATE]: 86400,
  [CachePeriodEnum.CUSTOM]: 21600,
};

/** Envelope guardado no Redis (metadados + payload); a expiração é o TTL do Redis. */
interface CacheEnvelope {
  data: any;
  cachedAt: string; // ISO
  ttl: number; // segundos, TTL original (para exibir no status)
  period: string;
  service: ServiceType;
  unit: string;
}

/**
 * Namespace de ambiente para as chaves no Redis. Prioridade:
 *  1) CACHE_PREFIX explícito (recomendado: "prod" em prod, "dev" em dev)
 *  2) derivado do RENDER_EXTERNAL_URL (difere entre os serviços Render) — rede de
 *     segurança caso esqueçam de setar o CACHE_PREFIX em um dos ambientes
 *  3) "local"
 * Assim, mesmo um Redis compartilhado nunca mistura os ambientes.
 */
function resolveNamespace(): string {
  const explicit = (process.env.CACHE_PREFIX || '').trim();
  if (explicit) return explicit.replace(/[^a-zA-Z0-9_-]/g, '_');
  const renderUrl = (process.env.RENDER_EXTERNAL_URL || '').trim();
  if (renderUrl) {
    try {
      return new URL(renderUrl).hostname.split('.')[0].replace(/[^a-zA-Z0-9_-]/g, '_');
    } catch {
      /* ignora URL malformada */
    }
  }
  return 'local';
}

@Injectable()
export class KpiCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KpiCacheService.name);

  // Fallback em memória — sempre disponível.
  private cache = new Map<string, CacheItem>();

  // Redis (opcional).
  private client: Redis | null = null;
  private redisReady = false;
  private redisErrorLogged = false;
  private readonly ns = resolveNamespace();

  onModuleInit(): void {
    const url = (process.env.REDIS_URL || '').trim();
    if (!url) {
      this.logger.log(
        'REDIS_URL ausente — cache operando em memória (Map por processo).',
      );
      return;
    }

    try {
      this.client = new Redis(url, {
        // Falha rápido quando desconectado, em vez de enfileirar/travar a request.
        enableOfflineQueue: false,
        maxRetriesPerRequest: 2,
        connectTimeout: 8000,
        // Reconecta com backoff; desiste depois de muitas tentativas (fica no Map).
        retryStrategy: (times) => (times > 15 ? null : Math.min(times * 300, 3000)),
      });

      this.client.on('ready', () => {
        this.redisReady = true;
        this.redisErrorLogged = false;
        this.logger.log(`Redis conectado — cache namespace "${this.ns}".`);
      });
      this.client.on('end', () => {
        this.redisReady = false;
      });
      this.client.on('error', (err) => {
        this.redisReady = false;
        if (!this.redisErrorLogged) {
          this.redisErrorLogged = true;
          this.logger.warn(
            `Redis indisponível (${err?.message}) — usando fallback em memória.`,
          );
        }
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao iniciar Redis (${
          err instanceof Error ? err.message : err
        }) — usando fallback em memória.`,
      );
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }

  private useRedis(): boolean {
    return !!this.client && this.redisReady;
  }

  /** Chave física no Redis (com namespace de ambiente). */
  private rk(logicalKey: string): string {
    return `${this.ns}:${logicalKey}`;
  }

  buildCacheKey(
    unit: string,
    service: ServiceType,
    period: CachePeriodEnum,
    customDates?: DateRange,
  ): string {
    const prefix = SERVICE_PREFIXES[service];
    if (period === CachePeriodEnum.CUSTOM && customDates) {
      const start = moment(customDates.start).format('YYYY-MM-DD');
      const end = moment(customDates.end).format('YYYY-MM-DD');
      return `${CACHE_KEY_PREFIX}:${unit}:${prefix}:custom:${start}:${end}`;
    }
    return `${CACHE_KEY_PREFIX}:${unit}:${prefix}:${period.toLowerCase()}`;
  }

  async get<T>(
    unit: string,
    service: ServiceType,
    period: CachePeriodEnum,
    customDates?: DateRange,
  ): Promise<T | null> {
    const key = this.buildCacheKey(unit, service, period, customDates);

    if (this.useRedis()) {
      try {
        const raw = await this.client!.get(this.rk(key));
        if (!raw) return null;
        const env = JSON.parse(raw) as CacheEnvelope;
        return env.data as T;
      } catch (err) {
        this.logRedisFallback('get', err);
        // cai para o Map abaixo
      }
    }

    const cached = this.cache.get(key);
    if (!cached) return null;
    if (new Date() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return cached.data as T;
  }

  async set<T>(
    unit: string,
    service: ServiceType,
    period: CachePeriodEnum,
    data: T,
    customDates?: DateRange,
    ttlSecondsOverride?: number,
  ): Promise<void> {
    const key = this.buildCacheKey(unit, service, period, customDates);
    const ttl = ttlSecondsOverride ?? this.getTTL(period, customDates);
    const periodLabel = period === CachePeriodEnum.CUSTOM ? 'custom' : period;

    if (this.useRedis()) {
      try {
        const envelope: CacheEnvelope = {
          data,
          cachedAt: new Date().toISOString(),
          ttl,
          period: periodLabel,
          service,
          unit,
        };
        await this.client!.set(this.rk(key), JSON.stringify(envelope), 'EX', ttl);
        return;
      } catch (err) {
        this.logRedisFallback('set', err);
        // cai para o Map abaixo
      }
    }

    if (this.cache.size >= MAX_CACHE_SIZE) this.cleanOldestEntries();
    const now = new Date();
    this.cache.set(key, {
      data,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + ttl * 1000),
      period: periodLabel,
      service,
      unit,
    });
  }

  async getOrCalculate<T>(
    unit: string,
    service: ServiceType,
    period: CachePeriodEnum,
    calculateFn: () => Promise<T>,
    customDates?: DateRange,
  ): Promise<CacheResult<T>> {
    const key = this.buildCacheKey(unit, service, period, customDates);
    const cached = await this.get<T>(unit, service, period, customDates);
    if (cached) return { data: cached, fromCache: true, cacheKey: key };

    const startTime = Date.now();
    const data = await calculateFn();
    const calculationTime = Date.now() - startTime;
    this.logger.log(`[${unit}] ${service} KPIs calculados em ${calculationTime}ms`);

    await this.set(unit, service, period, data, customDates);
    return { data, fromCache: false, calculationTime, cacheKey: key };
  }

  /** TTL dinâmico para CUSTOM conforme o tamanho do range (mesma regra atual) */
  private getTTL(period: CachePeriodEnum, customDates?: DateRange): number {
    if (period !== CachePeriodEnum.CUSTOM) return PERIOD_TTL[period];
    if (customDates) {
      const daysDiff = moment(customDates.end).diff(moment(customDates.start), 'days');
      if (daysDiff <= 10) return 600;
      if (daysDiff <= 30) return 1800;
      return 10800;
    }
    return PERIOD_TTL[CachePeriodEnum.CUSTOM];
  }

  private cleanOldestEntries(): void {
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime(),
    );
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) this.cache.delete(entries[i][0]);
    this.logger.debug(`Cache cleanup: removidas ${toRemove} entradas antigas`);
  }

  async invalidateUnit(unit: string, service?: ServiceType): Promise<number> {
    const logicalPrefix = service
      ? `${CACHE_KEY_PREFIX}:${unit}:${SERVICE_PREFIXES[service]}:`
      : `${CACHE_KEY_PREFIX}:${unit}:`;

    let count = 0;

    if (this.useRedis()) {
      try {
        const keys = await this.scanKeys(`${this.rk(logicalPrefix)}*`);
        if (keys.length) count = await this.client!.unlink(...keys);
        this.logger.log(
          `Invalidadas ${count} entradas (Redis) de ${unit}${service ? `/${service}` : ''}`,
        );
        return count;
      } catch (err) {
        this.logRedisFallback('invalidateUnit', err);
      }
    }

    for (const key of this.cache.keys()) {
      if (key.startsWith(logicalPrefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    this.logger.log(
      `Invalidadas ${count} entradas de ${unit}${service ? `/${service}` : ''}`,
    );
    return count;
  }

  async getDetailedStatus() {
    const now = new Date();

    let items: Array<{
      key: string;
      unit: string;
      service: string;
      period: string;
      cachedAt: string;
      expiresAt: string;
      isExpired: boolean;
      ageMinutes: number;
      expiresInMinutes: number;
    }> = [];

    let backend: 'redis' | 'memory' = 'memory';

    if (this.useRedis()) {
      try {
        backend = 'redis';
        const physicalKeys = await this.scanKeys(`${this.rk(CACHE_KEY_PREFIX)}:*`);
        if (physicalKeys.length) {
          const pipeline = this.client!.pipeline();
          physicalKeys.forEach((k) => {
            pipeline.get(k);
            pipeline.ttl(k);
          });
          const res = (await pipeline.exec()) || [];
          physicalKeys.forEach((physicalKey, i) => {
            const raw = res[i * 2]?.[1] as string | null;
            const ttlLeft = (res[i * 2 + 1]?.[1] as number) ?? -2;
            if (!raw) return; // expirou entre o scan e o get
            let env: CacheEnvelope;
            try {
              env = JSON.parse(raw) as CacheEnvelope;
            } catch {
              return;
            }
            const cachedAt = new Date(env.cachedAt);
            const isExpired = ttlLeft <= 0;
            // chave lógica = remove o "{ns}:" do começo
            const logicalKey = physicalKey.slice(this.ns.length + 1);
            items.push({
              key: logicalKey,
              unit: env.unit,
              service: env.service,
              period: String(env.period),
              cachedAt: cachedAt.toISOString(),
              expiresAt: new Date(now.getTime() + Math.max(0, ttlLeft) * 1000).toISOString(),
              isExpired,
              ageMinutes: Math.round((now.getTime() - cachedAt.getTime()) / 60000),
              expiresInMinutes: isExpired ? 0 : Math.round(ttlLeft / 60),
            });
          });
        }
      } catch (err) {
        this.logRedisFallback('getDetailedStatus', err);
        items = [];
        backend = 'memory';
      }
    }

    if (backend === 'memory') {
      items = Array.from(this.cache.entries()).map(([key, item]) => {
        const isExpired = now > item.expiresAt;
        return {
          key,
          unit: item.unit,
          service: item.service,
          period: String(item.period),
          cachedAt: item.cachedAt.toISOString(),
          expiresAt: item.expiresAt.toISOString(),
          isExpired,
          ageMinutes: Math.round((now.getTime() - item.cachedAt.getTime()) / 60000),
          expiresInMinutes: isExpired
            ? 0
            : Math.round((item.expiresAt.getTime() - now.getTime()) / 60000),
        };
      });
    }

    items.sort(
      (a, b) =>
        a.unit.localeCompare(b.unit) ||
        a.service.localeCompare(b.service) ||
        a.period.localeCompare(b.period),
    );

    const byUnit: Record<string, { total: number; active: number }> = {};
    for (const i of items) {
      byUnit[i.unit] = byUnit[i.unit] || { total: 0, active: 0 };
      byUnit[i.unit].total++;
      if (!i.isExpired) byUnit[i.unit].active++;
    }

    return {
      backend,
      namespace: this.ns,
      items,
      byUnit,
      summary: {
        total: items.length,
        active: items.filter((i) => !i.isExpired).length,
        expired: items.filter((i) => i.isExpired).length,
      },
    };
  }

  async clearAll(): Promise<number> {
    // NUNCA usa FLUSHDB — o Redis é compartilhado com o outro ambiente. Apaga só
    // as chaves do namespace atual.
    //
    // Em VÁRIAS PASSADAS: o SCAN do Redis não garante snapshot, então com
    // escritas concorrentes (um warmup em andamento) uma única passada pode
    // DEIXAR CHAVES PARA TRÁS — e aí a invalidação fica incompleta, justamente no
    // caso que mais importa (invalidar depois de corrigir um cálculo). Repete até
    // uma passada não encontrar nada, com teto para não girar para sempre.
    let removed = 0;
    if (this.useRedis()) {
      try {
        for (let pass = 1; pass <= 5; pass++) {
          const keys = await this.scanKeys(`${this.rk(CACHE_KEY_PREFIX)}:*`);
          if (keys.length === 0) break;
          // UNLINK em lotes: uma lista muito grande pode estourar o limite de
          // tamanho de requisição do provedor.
          for (let i = 0; i < keys.length; i += 200) {
            await this.client!.unlink(...keys.slice(i, i + 200));
          }
          removed += keys.length;
        }
        this.logger.log(`Cache Redis limpo (namespace "${this.ns}", ${removed} chaves).`);
      } catch (err) {
        this.logRedisFallback('clearAll', err);
      }
    }
    const inMemory = this.cache.size;
    this.cache.clear();
    this.logger.log(`Cache em memória limpo (${inMemory} entradas)`);
    return this.useRedis() ? removed : inMemory;
  }

  /** SCAN não-bloqueante por padrão (evita KEYS em produção). */
  private async scanKeys(pattern: string): Promise<string[]> {
    const found: string[] = [];
    return new Promise((resolve, reject) => {
      const stream = this.client!.scanStream({ match: pattern, count: 200 });
      stream.on('data', (keys: string[]) => found.push(...keys));
      stream.on('end', () => resolve(found));
      stream.on('error', reject);
    });
  }

  private logRedisFallback(op: string, err: unknown): void {
    this.redisReady = false;
    if (!this.redisErrorLogged) {
      this.redisErrorLogged = true;
      this.logger.warn(
        `Redis falhou em ${op} (${
          err instanceof Error ? err.message : err
        }) — fallback em memória.`,
      );
    }
  }
}
