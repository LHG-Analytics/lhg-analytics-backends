# Guia para o Frontend — Migração para o Backend Multi-Tenant

> **Status**: PLANEJADO — nada muda para o frontend ainda. Este documento descreve o contrato do novo backend unificado (`lhg-api`) para que o frontend possa se preparar. As datas de ativação serão comunicadas por fase (ver [MIGRATION-MULTI-TENANT.md](./MIGRATION-MULTI-TENANT.md)).
>
> **Garantia central da migração**: durante o cutover (Fase 4), o proxy manterá os paths atuais funcionando — **o frontend não precisa mudar nada para a migração acontecer**. A adoção das rotas novas é um passo posterior, no ritmo do frontend.

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

1. **Hoje / Fases 1–3**: nada muda. Backends atuais seguem respondendo nos paths atuais.
2. **Fase 4 (cutover)**: o proxy redireciona internamente os paths antigos para o `lhg-api`. **Frontend continua funcionando sem deploy.**
3. **Pós-cutover**: frontend migra para as rotas canônicas da seção 2 no seu ritmo. Os aliases antigos serão mantidos por um período de transição acordado e então removidos.
4. **Goiânia**: unidades novas já nascem SOMENTE no padrão novo (`/{unit}/api/...`).

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
