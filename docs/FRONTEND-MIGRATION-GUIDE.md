# Guia para o Frontend — Migração para o Backend Multi-Tenant

> **Status (2026-07-17)**: backend multi-tenant PRONTO e com paridade validada
> (6 unidades × 4 serviços — ver plano). **Staging disponível** em
> `https://analytics-dev.lhgmoteis.com.br` com o modo cutover (`LHG_CUTOVER=1`):
> os paths ANTIGOS continuam funcionando (reescritos internamente para o
> multi-tenant) — ou seja, **o frontend de staging funciona sem mudar nada** e
> já é 100% servido pelo backend novo. Ver [STAGING.md](./STAGING.md).
>
> **Garantia central da migração**: no cutover (staging e produção), o proxy
> mantém os paths atuais funcionando — **o frontend não precisa mudar nada
> para a migração acontecer**. A adoção das rotas novas é um passo posterior,
> no ritmo do frontend.
>
> **Mudanças de NÚMEROS esperadas ao comparar staging × produção** (não são
> bugs; detalhes no plano, Fase 3): gráficos por categoria de ipiranga/liv
> (correção de deslocamento de 1 dia do backend antigo), relatórios de
> restaurante das 5 unidades (valores líquidos/base de locações, padrão
> Altana), tout/adc (decisão D8: reservas ±2/semana; turnos de limpeza do
> tout corrigidos).

## 1. O que muda (e o que não muda)

| Aspecto | Hoje | Depois | Ação do frontend |
|---------|------|--------|------------------|
| **Payload das respostas** | JSON por módulo (BigNumbers, gráficos, tabelas) | **IDÊNTICO** | Nenhuma |
| **Query params** | `startDate`/`endDate` em `DD/MM/YYYY` | **IDÊNTICOS** | Nenhuma |
| **Autenticação** | Cookies httpOnly (`access_token`/`refresh_token`) via `/auth/api/*`, `credentials: 'include'` | **IDÊNTICA** (serviço auth continua separado) | Nenhuma |
| **Roles/Units** | `@Roles`/`@Units` por módulo | **IDÊNTICOS** (mesma matriz de acesso) | Nenhuma |
| **Consolidated (LHG)** | `authentication` `/auth/api/{Company,Bookings,Restaurant,Governance}/kpis/date-range` | **IDÊNTICO** | Nenhuma |
| **Path das rotas por unidade** | 1 prefixo de proxy + 1 prefixo interno por unidade (ex.: `/lush_ipiranga/ipiranga/api/...`) | **1 único padrão**: `/{unit}/api/...` | Trocar a montagem da URL (seção 3) |
| **Host** | 1 host único (proxy na Render) | Mesmo host | Nenhuma |

## 2. Rotas novas (contrato canônico)

Padrão: `https://<host>/{unit}/api/{Módulo}/...`

`{unit}` ∈ `lush_ipiranga` | `lush_lapa` | `tout` | `andar_de_cima` | `liv` | `altana` (+ unidades de Goiânia quando entrarem — mesmo padrão, sem mudança de código no frontend se o slug vier de config).

| Módulo | Rota nova | Roles com acesso (além de ADMIN/LHG) |
|--------|-----------|--------------------------------------|
| Company | `GET /{unit}/api/Company/kpis/date-range?startDate=DD/MM/YYYY&endDate=DD/MM/YYYY` | GERENTE_GERAL, GERENTE_FINANCEIRO |
| Bookings | `GET /{unit}/api/Bookings/bookings/date-range?startDate=...&endDate=...` | GERENTE_GERAL, GERENTE_RESERVAS |
| Restaurant | `GET /{unit}/api/Restaurants/restaurants/date-range?startDate=...&endDate=...` | GERENTE_GERAL, GERENTE_RESTAURANTE |
| Governance | `GET /{unit}/api/Governance/kpis/date-range?startDate=...&endDate=...` | GERENTE_GERAL, GERENTE_OPERACIONAL |

Auth (INALTERADO): `POST /auth/api/login`, `POST /auth/api/refresh`, `POST /auth/api/logout`, `GET /auth/api/me` — cookies httpOnly, sempre com `credentials: 'include'` / `withCredentials: true`.

## 3. Mapeamento antigo → novo

A única mudança é a **eliminação do prefixo interno duplicado** de cada unidade:

| Unidade | Path antigo (via proxy) | Path novo |
|---------|-------------------------|-----------|
| Lush Ipiranga | `/lush_ipiranga/ipiranga/api/...` | `/lush_ipiranga/api/...` |
| Lush Lapa | `/lush_lapa/lapa/api/...` | `/lush_lapa/api/...` |
| Tout | `/tout/tout/api/...` | `/tout/api/...` |
| Andar de Cima | `/andar_de_cima/andar_de_cima/api/...` | `/andar_de_cima/api/...` |
| Liv | `/liv/liv/api/...` | `/liv/api/...` |
| Altana | `/altana/altana/api/...` | `/altana/api/...` |

> ⚠️ Os paths "antigos" acima refletem o roteamento do backend (proxy `server.mjs` + prefixo global de cada app NestJS). Se o frontend tem rewrites próprios no Next.js (ex.: `baseURL: '/api'`), valide o mapeamento real no seu `next.config` — o contrato garantido é: **o segmento `/{service_prefix}` interno deixa de existir; o path passa a ser `/{unit}/api/...`**.

Sugestão de implementação no frontend (elimina strings duplicadas por unidade):

```ts
// config única por unidade — adicionar Goiânia aqui quando chegar
const UNITS = {
  lush_ipiranga: { label: 'Lush Ipiranga' },
  lush_lapa: { label: 'Lush Lapa' },
  tout: { label: 'Tout' },
  andar_de_cima: { label: 'Andar de Cima' },
  liv: { label: 'Liv' },
  altana: { label: 'Altana' },
} as const;

const unitApi = (unit: keyof typeof UNITS) =>
  axios.create({ baseURL: `/${unit}/api`, withCredentials: true });
```

## 4. Cache endpoints (se o frontend usar)

| Hoje | Depois |
|------|--------|
| `POST /{unit-antigo}/cache/refresh` por unidade | `POST /{unit}/api/cache/refresh` (por unidade) e `POST /api/cache/warmup` (todas) |
| `GET /{unit-antigo}/cache/status` | `GET /{unit}/api/cache/status` |

## 5. Cronologia e compatibilidade

1. **AGORA (staging)**: `analytics-dev.lhgmoteis.com.br` está em modo cutover — paths antigos funcionando, servidos pelo multi-tenant. Validar os dashboards aqui.
2. **Cutover de produção** (após validação): mesma mecânica — paths antigos continuam. **Frontend continua funcionando sem deploy.**
3. **Pós-cutover**: frontend migra para as rotas canônicas da seção 2 no seu ritmo. **Enquanto o proxy-shim existir**, as rotas canônicas ficam sob o prefixo `/lhg`: `https://<host>/lhg/{unit}/api/...` (é o mesmo backend; o shim só reescreve os paths antigos). Quando o proxy for aposentado, o canônico passa a ser direto: `/{unit}/api/...`.
4. **Goiânia**: unidades novas já nascem SOMENTE no padrão novo.

### Sugestão prática para a adoção

Centralize a base URL num único ponto e migre com 1 linha por etapa:

```ts
// etapa atual (paths antigos, funcionam em staging e produção):
const unitApi = (unit, prefix) => axios.create({ baseURL: `/${unit}/${prefix}/api`, withCredentials: true });
// etapa canônica com o shim vivo:
const unitApi = (unit) => axios.create({ baseURL: `/lhg/${unit}/api`, withCredentials: true });
// estado final (sem proxy):
const unitApi = (unit) => axios.create({ baseURL: `/${unit}/api`, withCredentials: true });
```

## 6. Erros e casos de borda (inalterados, mas vale reconfirmar)

- `401` sem/inválido token → fluxo de refresh (`POST /auth/api/refresh`) e retry, como no `AUTH_FRONTEND_GUIDE.md`.
- `403` = usuário sem role/unit para o módulo — a matriz não muda.
- Usuário com `unit: LIV` chamando `/tout/api/...` → `403` (hoje esse cruzamento é impossível por construção; no unificado é validado pelo guard — comportamento externo igual).
- Períodos: `startDate`/`endDate` são interpretados no "dia comercial" (06:00→05:59) para Company/Governance/Restaurant e dia civil para Bookings — sem mudança.

## 7. Checklist para o time do frontend

- [ ] Centralizar a construção de URL por unidade num único ponto (config/factory) — pré-requisito para adotar o padrão novo com 1 mudança.
- [ ] Confirmar os rewrites atuais do Next.js e mapear para a tabela da seção 3.
- [ ] Garantir `credentials: 'include'` em TODAS as chamadas (já é requisito hoje).
- [ ] Preparar o seletor de unidades para ler de config (7 unidades de Goiânia entrarão sem mudança estrutural).
- [ ] Smoke test pós-cutover: login → cada módulo × 1 unidade de cada grupo → Consolidated.
