# Staging do `lhg-api` (Fase 3 da migração)

Objetivo: colocar o backend multi-tenant online **sem tocar em produção**, para
validação humana (dashboards) e para o `scripts/parity-check.mjs` rodar
old×new lado a lado.

## Opção A (ATUAL): staging existente da branch `developer` ✅

O projeto já tem um ambiente de staging que deploya a branch **`developer`**
(mesma topologia de produção: PM2 + proxy + backends por unidade). Com a
`refactor` mergeada na `developer`, esse ambiente também roda o **lhg-api**:

- `ecosystem.config.js` ganhou o app `lhg-api` (porta interna 3010), reusando
  as MESMAS env vars que o serviço já tem (`DATABASE_URL_LOCAL_*`, `JWT_SECRET`).
- `server.mjs` ganhou a rota `/lhg/*` → lhg-api (com strip do prefixo).

URLs no staging (host = o do serviço da branch developer):

```
https://<staging-host>/lhg/health                                  ← healthcheck
https://<staging-host>/lhg/api/docs                                ← swagger
https://<staging-host>/lhg/{unit}/api/Company/kpis/date-range?...  ← rotas por unidade
https://<staging-host>/lhg/api/cache/warmup                        ← warmup all-units (POST)
BACKENDS ANTIGOS continuam nos paths atuais: perfeito para a paridade no mesmo host.
```

Nenhuma env var nova é necessária (o serviço já tem todas).

## Opção B (alternativa): serviço dedicado só para o lhg-api

**New → Web Service**: Branch `refactor` | Build `npm install && npm run build:api`
| Start `node lhg-api/dist/main.js` | Health Check `/health` | envs: `JWT_SECRET`
+ 6× `DATABASE_URL_LOCAL_*` (a do LIV: usar o host do authentication/.env — o do
liv/.env está desatualizado) + `ALLOWED_ORIGINS` opcional. `PORT` é injetada
pelo Render (o main.ts respeita).

## Verificação pós-deploy (2 minutos)

```bash
HOST=https://<staging-host>

# 1. Saúde
curl $HOST/lhg/health
# → {"status":"ok","service":"lhg-api","units":[...6 slugs...]}

# 2. Auth funcionando (espera 401 sem token)
curl -i "$HOST/lhg/altana/api/Company/kpis/date-range?startDate=01/07/2026&endDate=10/07/2026"

# 3. Warmup multi-unidade (popula o cache das 6 unidades de uma vez)
curl -X POST $HOST/lhg/api/cache/warmup
curl $HOST/lhg/api/cache/status   # byUnit deve encher (6 unidades × 4 serviços × 4 períodos)
```

## Paridade no staging (o critério do "100%")

Old e new no MESMO host — mesmo instante, mesmos bancos (elimina drift de dados vivos):

```bash
JWT_SECRET=... \
OLD_BASE=https://<staging-host> \
NEW_BASE=https://<staging-host>/lhg \
UNITS=lush_ipiranga,lush_lapa,tout,andar_de_cima,liv,altana \
PERIODS=LAST_7_D,THIS_MONTH,LAST_MONTH \
node scripts/parity-check.mjs
```

Saída esperada: `🎉 PARIDADE 100%` (ou a lista exata de diffs por caminho do JSON).
Rodada de referência: altana local = 8/8 idênticas (2026-07-16). Se surgirem diffs
nas outras unidades, é provável que sejam variantes locais ainda não parametrizadas
(caso do tout/adc em rentalType) — o diff por caminho aponta exatamente onde.

⚠️ Se um path antigo diferir (`/{unit}/{service_prefix}/api/...` via proxy),
ajustar OLD_BASE ou o mapeamento — validar com uma unidade antes da bateria completa.

## 5. Validação pelo frontend (preview)

1. Criar um preview do frontend na Vercel com os rewrites das unidades apontando
   para `https://<staging-host>/lhg` (auth continua apontando para a
   produção — o `JWT_SECRET` é o mesmo, o cookie emitido lá vale no staging).
2. Adicionar a origem do preview em `ALLOWED_ORIGINS` do staging.
3. Navegar unidade por unidade × módulo por módulo comparando com produção.
   Deltas esperados: **nenhum** (a Fase 1 já foi mergeada em produção; staging e
   produção devem mostrar os mesmos números).

## 6. O que o staging NÃO tem (de propósito)

- Warmup automático por cron (dispare manualmente pelo endpoint quando precisar).
- O serviço de autenticação (login continua no de produção).
- Qualquer escrita em banco — o lhg-api só faz SELECT.
