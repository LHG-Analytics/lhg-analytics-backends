# Plano de Migração: Backend Multi-Tenant Único

> **Status**: Fase 0 (higiene) concluída nesta branch (`refactor`). Fases 1+ pendentes de execução.
> **Última atualização**: 2026-07-16
> **Documento irmão**: [FRONTEND-MIGRATION-GUIDE.md](./FRONTEND-MIGRATION-GUIDE.md) — o que muda para o frontend.

## 1. Sumário executivo

Hoje o LHG Analytics roda **6 backends NestJS quase idênticos** (um por unidade) + 1 serviço de autenticação, todos em **uma única instância Render** orquestrados por PM2 atrás de um proxy reverso (`server.mjs`). Adicionar uma unidade nova exige copiar um backend inteiro, ajustar IDs espalhados em SQL, criar processo no PM2, rota no proxy, secret no CI, etc. Com **7 unidades de Goiânia** chegando, o formato atual levaria a ~15 processos Node na mesma máquina — insustentável em memória, conexões e manutenção (cada bugfix hoje é aplicado 6×; comprovado em produção diversas vezes).

**Objetivo**: unificar os 6 backends de unidade em **1 aplicação NestJS multi-tenant**, onde a unidade é um **parâmetro de rota + registro de configuração**, não um deploy. Adicionar unidade nova passa a ser: 1 registro de config + 1 env var.

**Viabilidade comprovada**: o serviço `authentication` **já contém um multi-tenant funcional** (visão "Consolidated"): pools `pg` por unidade (`DatabaseService`), registry `UNIT_CONFIGS` com config por unidade, e services `*-multitenant.service.ts` com SQL parametrizado para os 4 domínios. O padrão-alvo já existe no próprio repositório.

## 2. Estado atual (mapeado em 2026-07-16)

### 2.1 Topologia

```
Render (1 instância, porta pública $PORT)
└── PM2 (ecosystem.config.js) — 8 processos Node
    ├── proxy      :3000  server.mjs (Express + http-proxy-middleware)  ← entrada pública
    │     /auth            → :3005 (com pathRewrite ^/auth → '')
    │     /lush_ipiranga   → :3001      /lush_lapa → :3002     /tout → :3003
    │     /andar_de_cima   → :3004      /liv       → :3006     /altana → :3007
    ├── auth       :3005  authentication (JWT + users Supabase + Consolidated multi-tenant)
    └── 6 × unidade       cada uma: cache em memória próprio + pool pg (máx 5) + Prisma local
Frontend: Vercel (lhg-analytics.vercel.app / analytics.lhgmoteis.com.br), cookies httpOnly.
Warmup: GitHub Actions cron (0/6/12/15h BRT) → POST /cache/warmup em cada backend.
```

Consequências do modelo: 8 heaps Node disputando a RAM de 1 instância (causa provável dos restarts do processo `liv` e da perda do cache em memória); até ~35+ conexões de banco saindo da mesma caixa; 6 caches e 6 warmups independentes.

### 2.2 As duas linhagens de código (descoberta crítica do diff)

Os 6 backends **não** são 6 variações independentes — são **2 linhagens**:

| Linhagem | Backends | Característica |
|----------|----------|----------------|
| **Grupo A** ("avançado") | `lush_ipiranga`, `liv` | Lógica de reservas mais rica (fallback `valorcontratado→valortotalpermanencia`, cancelamentos tardios, ramo por origem 7/8); continha dead code (removido na Fase 0) |
| **Grupo B** ("simplificado") | `lush_lapa`, `tout`, `andar_de_cima`, `altana` | `SUM(valorcontratado)` simples; código mais limpo; usa `queryUtils.formatDateToSQL` |

**~85-90% do código é idêntico ou difere só por configuração; ~10-15% é lógica genuinamente divergente**, concentrada em `bookings.service.ts` (receita de reservas) e `company.service.ts` (query semanal de RevPAR/Giro reescrita de 3 formas: ipiranga ≠ liv ≠ Grupo B).

### 2.3 Acessos a banco duplicados por unidade

Cada backend de unidade acessa o **mesmo** banco AUTOMO por dois caminhos: `PgPoolService` (`pg`, máx 5 conexões — bookings/governance/restaurant) e o **Prisma client local** `@client-local` (company.service — refactor Prisma→pg ficou incompleto; comentários no Grupo B confirmam: *"removed during migration from Prisma to pg"*). O CLAUDE.md dizia que o Prisma local era "só para validação de token" — **estava errado** (corrigido).

### 2.4 Acoplamento cruzado com `authentication`

Os backends de unidade **compilam junto o código-fonte do `authentication`** (`tsconfig.build.json` com `rootDirs: ["src", "../authentication/src"]` + aliases `@auth/*`) e espelham endpoints de login/refresh/logout usando `AuthService`/`PrismaService` do projeto auth. A validação de JWT em si é stateless (`jwt.verify` com `JWT_SECRET` compartilhado — não toca banco).

### 2.5 O que é configuração por unidade (o "DNA" de cada tenant)

| Config | ipiranga | lapa | tout | adc | liv | altana |
|--------|---|---|---|---|---|---|
| Porta | 3001 | 3002 | 3003 | 3004 | 3006 | 3007 |
| Env do banco | `..._IPIRANGA` | `..._LAPA` | `..._TOUT` | `..._ANDAR_DE_CIMA` | `..._LIV` | `..._ALTANA` |
| `@Units` | `LUSH_IPIRANGA` | `LUSH_LAPA` | `TOUT` | `ANDAR_DE_CIMA` | `LIV` | `ALTANA` |
| Category IDs (suítes) | `10,11,12,15,16,17,18,19,24` | `7,8,9,10,11,12,13,14` | `6,7,8,9,10,12` | `2,3,4,5,6,7,12` | `1,2,3,4,5,7,8,9,10,11` | `1..12` |
| Camareiras `id_cargo` | `4,45` | `4,20` | `4,20` | `7,13` | `4` | `6,7` |
| Supervisor `id_cargo` | `24` | `19` | `2` | `6` | `7` | `3` |
| Terceirizados | ids fixos | ids fixos | — | — | `horarioinicioexpediente` NULL | — |
| Horário comercial (governance) | 06→05:59 | **04→03:59** | 06→05:59 | 06→05:59 | 06→05:59 | 06→05:59 |
| Product types A&B (restaurante) | lista própria | lista própria | lista própria | lista própria | lista própria | lista própria (15 tipos) |
| Origens de reserva (bookings) | `7,8` especiais; `1,3,4,6,7,8` | idem | idem | idem | idem | idem |
| `RentalTypeEnum` | THREE/SIX/TWELVE_HOURS, DAY_USE, OVERNIGHT, DAILY | idem | idem | idem | idem | **ONE/TWO/FOUR/TWELVE_HOURS** |
| Nome exibido (`Company:` nos retornos) | Lush Ipiranga | Lush Lapa | Tout | Andar de Cima | Liv | Altana |

Além disso: nomes de categorias por descrição (`ca.descricao IN (...)`) em algumas queries do company (preferir sempre IDs — já foi fonte de 2 bugs em produção: Giro do LIV inflado 10×, A&B do Altana subcontado).

### 2.6 Outras descobertas relevantes

- `lhg-utils` é genérica (sem nada por unidade), mas com bastante código morto; `CompressionUtilsModule` é importado nos 7 apps e **nunca usado** (compressão real é `app.use(compression())` no main.ts). `authentication` mantém um **fork local** do DateUtils.
- Discrepância de env no `ecosystem.config.js`: define `SERVICE_PREFIX`/`PORT` mas os `main.ts` leem `SERVICE_PREFIX_<UNIT>`/`PORT_<UNIT>` — funciona por acaso (defaults hardcoded). Altana usa os nomes corretos.
- `.env` locais (não versionados — verificado no git e no histórico) contêm credenciais reais idênticas em 8 lugares; `JWT_SECRET` compartilhado. **Recomendação: rotacionar segredos e centralizar no Render.**
- Auditorias anteriores em `audit/` (segurança/performance); P0s marcados como concluídos; Redis foi avaliado e cancelado à época.

## 3. Arquitetura alvo

### 3.1 Visão

```
Render (1 instância — ou 2: api + auth)
└── lhg-api (NestJS único, multi-tenant)
    ├── TenantModule
    │   ├── tenant.registry.ts     ← config por unidade (ver 3.2)
    │   └── TenantMiddleware/Param ← resolve :unit da rota → TenantContext
    ├── DatabaseModule             ← Map<unit, Pool> (máx 5/unidade, lazy)
    ├── CacheModule                ← chaves prefixadas por unidade: kpi:{unit}:{svc}:{...}
    ├── auth/ (guards JWT iguais; UnitsGuard valida user.unit × :unit da rota)
    ├── company/ bookings/ restaurant/ governance/
    │   └── services recebem TenantConfig; SQL parametrizado pelos campos do registry
    └── cache/warmup               ← 1 endpoint aquece TODAS as unidades (loop no registry)
```

- O serviço `authentication` continua separado (emissor de JWT + users + Consolidated), ou é absorvido depois (decisão adiada — não bloqueia).
- O **proxy `server.mjs` morre** ou vira um shim de compatibilidade de 10 linhas durante a transição (rewrite `/liv/liv/api/*` → `/api/liv/*` etc.).
- **Prisma local**: eliminar no unificado — padronizar 100% em `PgPoolService` (o schema local só é consumido via `$queryRaw`, que é literalmente SQL cru; portar as queries do company é mecânico). Um schema Prisma local de referência pode ser mantido para documentação, sem client gerado.

### 3.2 Tenant registry (esqueleto)

```ts
// src/tenant/tenant.registry.ts
export interface TenantConfig {
  slug: string;                 // 'liv' — usado na rota /:unit/
  unitEnum: string;             // 'LIV' — casa com JwtPayload.unit e @Units
  displayName: string;          // 'Liv' — campo Company dos retornos
  databaseUrlEnv: string;       // 'DATABASE_URL_LOCAL_LIV'
  suiteCategoryIds: number[];   // ca.id IN (...)
  governance: {
    camareirasCargoIds: number[];
    supervisorCargoId: number;
    terceirizadosStrategy: { kind: 'byEmployeeIds'; ids: number[] } | { kind: 'byNullSchedule' };
    excludedEmployeeIds: number[];
    commercialDayStartHour: number;   // 6 (lapa: 4)
  };
  restaurant: {
    abProductTypeIds: number[];       // A ∪ B
    aProductTypeIds: number[];        // alimentos
    bProductTypeIds: number[];        // bebidas
    aRankingIds: number[]; bRankingIds: number[];
    // "outros" = catch-all (NOT IN abProductTypeIds OR NULL) — nunca lista fixa
  };
  bookings: { specialOriginIds: number[]; validOriginIds: number[] };
  rentalTypes: RentalTypeMap;         // altana difere dos demais
}

export const TENANTS: Record<string, TenantConfig> = { lush_ipiranga: {...}, ... };
```

Começa como arquivo TS versionado (simples, revisável em PR). Evoluir para tabela no Supabase só se/quando precisar de edição sem deploy.

### 3.3 Rotas

Canônico novo: `/:unit/api/{Company|Bookings|Restaurants|Governance|auth|cache}/...` — mesmo shape de path que o frontend já usa hoje atrás do proxy, apenas com o slug unificado (ver guia do frontend). `UnitsGuard` ganha a comparação `params.unit` × `user.unit` (ADMIN/LHG acessa todas). Warmup: `POST /cache/warmup` (todas as unidades) e `POST /:unit/cache/refresh`.

### 3.4 Conexões, cache, warmup

- **Pools**: `Map<slug, Pool>` com `max: 5` por unidade (igual hoje), criados lazy no primeiro uso. 13 unidades × 5 = teto teórico 65 conexões, mas distribuídas 1 pool por banco — igual ao total de hoje, num processo só.
- **Cache**: mesmo `KpiCacheService`, com `unit` na chave. `MAX_CACHE_SIZE` recalibrado (100 → 100×N ou por-unidade). **Fase posterior (opcional)**: trocar por Redis para sobreviver a restart — decisão independente da unificação.
- **Warmup**: 1 chamada aquece todas as unidades (loop registry × 4 serviços × 4 períodos, concorrência limitada). O workflow do GitHub Actions encolhe para 1 step + verify.

## 4. Decisões de negócio pendentes (bloqueiam a Fase 1)

| # | Decisão | Opções | Recomendação |
|---|---------|--------|--------------|
| D1 | **Lógica canônica de receita de reservas** (bookings) | Grupo A (fallback + cancelamento tardio + ramo origem) vs Grupo B (simples) | Validar com o negócio qual número é o "certo"; implementar UMA no unificado. Os números das unidades do grupo perdedor **vão mudar** — comunicar. |
| D2 | **Query semanal RevPAR/Giro** (company) | 3 variantes estruturais | Escolher 1, validar equivalência numérica contra as 3 antes do cutover |
| D3 | Horário comercial da Lapa (04→03:59) | Config real ou drift? | Confirmar com operação; se real, vira campo do registry (já previsto) |
| D4 | `RentalTypeEnum` do Altana | Config por tenant ou padronizar? | Manter por tenant no registry |
| D5 | Absorver `authentication` no unificado? | Manter separado / absorver | Manter separado na v1 (menos risco); reavaliar depois |
| D6 | Redis para cache | Agora / depois / nunca | Depois do cutover (a unificação já reduz muito a pressão de memória) |

## 5. Fases

### Fase 0 — Higiene e verdade no repo ✅ (feita nesta branch)
Sem impacto para frontend, sem mudança de comportamento:
- [x] `.gitattributes` + renormalização de line endings (altana era LF, resto CRLF). Configurar `git config merge.renormalize true` ao mergear master↔refactor.
- [x] Remoção de dead code: `fetchKpiData` e `getWeeklyMetricsConsolidated` (ipiranga/liv, 0 chamadas), `src/auth/auth.service.ts` órfão (ipiranga/liv, nunca importado), bloco DEBUG do `liv/governance.service.ts` (4 queries reais executadas só para `console.log`) e logs de TeamSizing.
- [x] `compression` + `@types/compression` declarados no Grupo B (eram usados via hoisting sem declaração); `start:dev` do Grupo B agora roda `generate` antes.
- [x] `binaryTargets` do Prisma unificados (`native, windows, debian-openssl-3.0.x` nos 6; tout tinha só debian, resto só windows).
- [x] Lixo removido: `build_output.log` (lapa/altana), `liv/package-lock.json`.
- [x] CLAUDE.md corrigido (Prisma local, IDs da lapa, altana, topologia, cache/warmup real).

### Fase 1 — Reconciliação de drift (ainda nos 6 backends, ANTES de unificar)
Requer D1–D3 decididos. Cada item muda números → validar com dashboard:
- [ ] Aplicar a lógica canônica de bookings (D1) nas unidades do grupo perdedor.
- [ ] Unificar a query semanal RevPAR/Giro (D2) nos 6.
- [ ] Trocar filtros por `ca.descricao` restantes por `ca.id` (fonte recorrente de bugs).
- [ ] tout: migrar `restaurant` para `queryUtils.formatDateToSQL` como os demais.
- [ ] Rodar 1 ciclo de produção comparando KPIs antes/depois por unidade.

**Racional**: unificar ANTES de reconciliar espalharia mudanças de números no meio do refactor, impossibilitando o teste de paridade da Fase 3.

### Fase 2 — Construção do `lhg-api` multi-tenant
- [ ] Novo workspace `lhg-api` no monorepo (não tocar nos 6 existentes).
- [ ] TenantModule + registry (3.2) com as 6 unidades atuais.
- [ ] DatabaseModule multi-pool (basear em `authentication/src/database/` que já faz isso).
- [ ] Portar módulos na ordem: `restaurant` (menor) → `governance` → `bookings` → `company` (maior). Company: portar de `prismaLocal.$queryRaw` para `PgPoolService` no processo.
- [ ] Cache com chave por unidade + warmup all-units.
- [ ] Auth: guards atuais + `UnitsGuard` ciente do `:unit` da rota. Remover o acoplamento `rootDirs`/`@auth/*` (extrair `JwtPayload` para `@lhg/utils`).
- [ ] Swagger único com o parâmetro de unidade.

### Fase 3 — Paridade (shadow testing)
- [ ] Rodar `lhg-api` em paralelo com os 6 (porta nova no PM2, sem tráfego real).
- [ ] Script de paridade: para cada unidade × serviço × período (7d/mês passado/mês atual/YTD), comparar JSON do backend antigo vs novo (tolerância de arredondamento). **Critério de saída: 100% dos KPIs batendo** para 2 ciclos de warmup consecutivos.

### Fase 4 — Cutover incremental
- [ ] No proxy `server.mjs`, apontar UMA unidade (sugestão: `tout`, menor risco) para o `lhg-api`; observar 2–3 dias.
- [ ] Migrar as demais em ondas (2+2+1). O frontend não muda nada nesta fase (proxy mantém os paths).
- [ ] Desligar os processos antigos no PM2 conforme migram; RAM liberada.
- [ ] Ao final: frontend migra para as rotas canônicas no seu ritmo (guia próprio); proxy vira shim mínimo e depois morre.

### Fase 5 — Onboarding Goiânia (o payoff)
Por unidade nova: 1 entrada no registry + 1 env var `DATABASE_URL_LOCAL_<UNIT>` + 1 valor no enum `UserUnit` (migration Supabase) + warmup automático. **Sem** novo processo, deploy, rota de proxy ou secret de CI. Checklist de descoberta dos IDs (categorias de suíte, cargos, tipos de produto) via queries de diagnóstico documentadas.

### Fase 6 — Limpeza
- [ ] Remover os 6 workspaces antigos, `server.mjs`, `ecosystem.config.js` (ou reduzir a 2 apps: api + auth).
- [ ] Consolidar `lhg-utils` (remover código morto; absorver o fork de DateUtils do authentication).
- [ ] Rotacionar `JWT_SECRET` e senhas de banco; centralizar env no Render.
- [ ] Atualizar CLAUDE.md/docs para a arquitetura final.

## 6. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Números de KPI mudarem sem querer na unificação | Fase 1 separada da Fase 2 + teste de paridade (Fase 3) com critério objetivo |
| D1 mudar números de unidades em produção | Comunicar ao negócio ANTES; mudar junto com nota no dashboard |
| Pool/memória no processo único | Pools lazy por unidade (mesmo teto de conexões de hoje); heap único é ~8× menor que a soma atual |
| Regressão de auth (guards por rota `:unit`) | Testes e2e dos guards por role×unit antes do cutover |
| Merge master→refactor durante a migração | `.gitattributes` + `merge.renormalize=true`; manter fixes de produção pequenos e cherry-pickáveis |
| Warmup do processo único falhar | Warmup já paralelo/TTL 12h (corrigido no master); no unificado, 1 warmup para todas → o verify do CI simplifica |

## 7. Estimativa de esforço (ordem de grandeza)

| Fase | Esforço |
|------|---------|
| 0 — Higiene | ✅ feita |
| 1 — Reconciliação | 2–4 dias (dependente das decisões D1–D3) |
| 2 — lhg-api | 2–3 semanas |
| 3 — Paridade | 1 semana (script + 2 ciclos) |
| 4 — Cutover | 1–2 semanas (calendário, não esforço) |
| 5 — Goiânia | ~0,5 dia por unidade |
| 6 — Limpeza | 2–3 dias |

## 8. Por que NÃO "frontend direto no banco" (registro da decisão)

Avaliado e descartado em 2026-07-16: (a) bancos AUTOMO têm limite baixo de conexões e ficam atrás de firewall/DDNS — serverless da Vercel escala horizontalmente e não tem IP fixo de saída no plano Pro; (b) as queries de KPI levam segundos/minutos (statement_timeout 2min) — o cache é o que torna o produto rápido, e cache em serverless exige Redis externo; (c) bater análise pesada direto no banco operacional do PMS arrisca a operação do motel; (d) a latência não está no hop do backend, está nas queries. O problema real era a duplicação — resolvida pelo multi-tenant.
