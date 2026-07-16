# Staging do `lhg-api` no Render (Fase 3 da migração)

Objetivo: colocar o backend multi-tenant online **sem tocar em produção**, para
validação humana (dashboards) e para o `scripts/parity-check.mjs` rodar contra
produção × staging.

## 1. Criar o serviço no Render

**New → Web Service**, apontando para este repositório:

| Campo | Valor |
|-------|-------|
| Name | `lhg-api-staging` |
| Branch | **`refactor`** ← a chave: staging acompanha a branch, produção continua no master |
| Root Directory | (vazio — raiz do repo) |
| Runtime | Node |
| Build Command | `npm install && npm run build:api` |
| Start Command | `node lhg-api/dist/main.js` |
| Health Check Path | `/health` |
| Instance | o menor pago que não hiberne (free hiberna e perde o cache em memória) |

Auto-deploy ligado na branch `refactor` = cada push nosso atualiza o staging.

## 2. Variáveis de ambiente (dashboard do Render)

Obrigatórias:

```
JWT_SECRET                       ← MESMO valor dos serviços atuais (o login de produção passa a valer no staging)
DATABASE_URL_LOCAL_IPIRANGA      ← as mesmas de produção (consulta/read-only)
DATABASE_URL_LOCAL_LAPA
DATABASE_URL_LOCAL_TOUT
DATABASE_URL_LOCAL_ANDAR_DE_CIMA
DATABASE_URL_LOCAL_LIV           ← usar o host que FUNCIONA (o do authentication/.env; o do liv/.env está desatualizado)
DATABASE_URL_LOCAL_ALTANA
```

Opcionais:

```
ALLOWED_ORIGINS=preview-do-frontend.vercel.app   ← origem do preview do front (CSV)
NODE_OPTIONS=--max-old-space-size=1024
```

`PORT` é injetada pelo Render automaticamente (o main.ts respeita).

## 3. Verificação pós-deploy (2 minutos)

```bash
# 1. Saúde
curl https://lhg-api-staging.onrender.com/health
# → {"status":"ok","service":"lhg-api","units":[...6 slugs...]}

# 2. Auth funcionando (espera 401 sem token)
curl -i https://lhg-api-staging.onrender.com/altana/api/Company/kpis/date-range?startDate=01/07/2026&endDate=10/07/2026

# 3. Warmup multi-unidade (popula o cache das 6 unidades de uma vez)
curl -X POST https://lhg-api-staging.onrender.com/api/cache/warmup
curl https://lhg-api-staging.onrender.com/api/cache/status   # byUnit deve encher
```

Swagger: `https://lhg-api-staging.onrender.com/api/docs`

## 4. Paridade contra produção (o critério do "100%")

Do seu terminal (ou de um runner), com o `JWT_SECRET` real:

```bash
JWT_SECRET=... \
OLD_BASE=https://<host-de-producao>       # o proxy atual (server.mjs)
NEW_BASE=https://lhg-api-staging.onrender.com \
UNITS=lush_ipiranga,lush_lapa,tout,andar_de_cima,liv,altana \
PERIODS=LAST_7_D,THIS_MONTH,LAST_MONTH \
node scripts/parity-check.mjs
```

Saída esperada: `🎉 PARIDADE 100%` (ou a lista exata de diffs por caminho do JSON).
Exceções conhecidas/documentadas: variantes locais de rentalType do tout/adc
(ver docs/MIGRATION-MULTI-TENANT.md, Fase 2) — se aparecerem, conferir se o diff
está restrito a `ReservationsByRentalType`/campos de rental type.

⚠️ Os paths são os mesmos nos dois lados (`/{unit}/api/...`), mas no lado antigo
o path passa pelo proxy (`/{unit}` → serviço da unidade, que tem prefixo
`{service_prefix}/api`). Se o host antigo usado não for o proxy e sim um serviço
direto, ajuste OLD_BASE de acordo.

## 5. Validação pelo frontend (preview)

1. Criar um preview do frontend na Vercel com os rewrites das unidades apontando
   para `https://lhg-api-staging.onrender.com` (auth continua apontando para a
   produção — o `JWT_SECRET` é o mesmo, o cookie emitido lá vale no staging).
2. Adicionar a origem do preview em `ALLOWED_ORIGINS` do staging.
3. Navegar unidade por unidade × módulo por módulo comparando com produção.
   Deltas esperados: **nenhum** (a Fase 1 já foi mergeada em produção; staging e
   produção devem mostrar os mesmos números).

## 6. O que o staging NÃO tem (de propósito)

- Warmup automático por cron (dispare manualmente pelo endpoint quando precisar).
- O serviço de autenticação (login continua no de produção).
- Qualquer escrita em banco — o lhg-api só faz SELECT.
