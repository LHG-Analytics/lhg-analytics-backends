#!/usr/bin/env node
/**
 * PARIDADE lhg-api × backends por unidade (Fase 3 da migração multi-tenant).
 *
 * Compara o JSON completo dos 4 endpoints de KPI entre o backend antigo da
 * unidade e o lhg-api, com tolerância numérica, e reporta as diferenças por
 * caminho (path) do JSON. Critério de saída da Fase 3: 100% verde por 2 ciclos.
 *
 * Uso (variáveis de ambiente):
 *   JWT_SECRET   obrigatório — assina um token ADMIN/LHG local (mesmo secret dos serviços)
 *   OLD_BASE     base do backend antigo   (ex.: http://localhost:3007  ou  https://prod-host)
 *   NEW_BASE     base do lhg-api          (ex.: http://localhost:3010  ou  https://staging-host)
 *   UNITS        csv de slugs (default: altana) — o path é o MESMO nos dois lados: /{unit}/api/...
 *   PERIODS      csv de períodos: LAST_7_D,THIS_MONTH,LAST_MONTH (default: LAST_7_D,THIS_MONTH)
 *   TOLERANCE    tolerância numérica absoluta (default: 0.011 — arredondamento de centavos)
 *   MAX_DIFFS    máx. de diffs listados por endpoint (default: 12)
 *
 * Exemplo local (altana antigo em :3007, lhg-api em :3010):
 *   JWT_SECRET=... OLD_BASE=http://localhost:3007 NEW_BASE=http://localhost:3010 \
 *   UNITS=altana node scripts/parity-check.mjs
 *
 * Exceções conhecidas (drift documentado, não bloqueiam a paridade):
 *   - tout/adc: classificação local de rentalType (variantes inline) — ver plano D-notes.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'package.json'));
const jwt = require('jsonwebtoken');
const moment = require('moment-timezone');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('JWT_SECRET é obrigatório (mesmo secret dos serviços).');
  process.exit(2);
}
const OLD_BASE = process.env.OLD_BASE || 'http://localhost:3007';
const NEW_BASE = process.env.NEW_BASE || 'http://localhost:3010';
const UNITS = (process.env.UNITS || 'altana').split(',').map((s) => s.trim()).filter(Boolean);
const PERIOD_NAMES = (process.env.PERIODS || 'LAST_7_D,THIS_MONTH')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const TOLERANCE = Number(process.env.TOLERANCE || 0.011);
const MAX_DIFFS = Number(process.env.MAX_DIFFS || 12);

const ENDPOINTS = [
  { service: 'company', path: 'Company/kpis/date-range' },
  { service: 'bookings', path: 'Bookings/bookings/date-range' },
  { service: 'restaurant', path: 'Restaurants/restaurants/date-range' },
  { service: 'governance', path: 'Governance/kpis/date-range' },
];

function buildPeriods() {
  const yesterday = moment().subtract(1, 'day');
  const fmt = (m) => m.format('DD/MM/YYYY');
  const all = {
    LAST_7_D: {
      start: fmt(moment(yesterday).subtract(6, 'days')),
      end: fmt(yesterday),
    },
    THIS_MONTH: { start: fmt(moment().startOf('month')), end: fmt(yesterday) },
    LAST_MONTH: {
      start: fmt(moment(yesterday).subtract(1, 'month').startOf('month')),
      end: fmt(moment(yesterday).subtract(1, 'month').endOf('month')),
    },
  };
  return PERIOD_NAMES.filter((p) => all[p]).map((p) => ({ name: p, ...all[p] }));
}

const token = jwt.sign(
  { id: 0, email: 'parity@lhg', name: 'Parity', unit: 'LHG', role: 'ADMIN' },
  SECRET,
  { expiresIn: '30m' },
);

async function fetchJson(base, unitPath, ep, period) {
  const url = `${base}/${unitPath}/api/${ep}?startDate=${encodeURIComponent(period.start)}&endDate=${encodeURIComponent(period.end)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

/**
 * Prefixo do lado ANTIGO. O lhg-api sempre usa o slug (/{unit}/api/...), mas os
 * backends antigos têm prefixo interno próprio (lush_ipiranga → /ipiranga/api).
 * OLD_PREFIX: override único (uso com UNITS de 1 unidade) ou mapa slug=prefixo csv
 * (ex.: "lush_ipiranga=ipiranga,lush_lapa=lapa"). Default: o próprio slug.
 */
const OLD_PREFIX_MAP = Object.fromEntries(
  (process.env.OLD_PREFIX || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => (pair.includes('=') ? pair.split('=') : [null, pair])),
);
const oldPathFor = (unit) => OLD_PREFIX_MAP[unit] ?? OLD_PREFIX_MAP[null] ?? unit;

/** Compara recursivamente; retorna lista de diffs {path, old, new} */
function deepDiff(a, b, base = '', diffs = []) {
  if (diffs.length > 500) return diffs; // trava de segurança
  const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)));
  if (isNum(a) && isNum(b)) {
    if (Math.abs(Number(a) - Number(b)) > TOLERANCE) diffs.push({ path: base, old: a, new: b });
    return diffs;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (String(a) !== String(b)) diffs.push({ path: base, old: a, new: b });
    return diffs;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    diffs.push({ path: base, old: `array=${Array.isArray(a)}`, new: `array=${Array.isArray(b)}` });
    return diffs;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const p = base ? `${base}.${k}` : k;
    if (!(k in a)) diffs.push({ path: p, old: '<ausente>', new: summarize(b[k]) });
    else if (!(k in b)) diffs.push({ path: p, old: summarize(a[k]), new: '<ausente>' });
    else deepDiff(a[k], b[k], p, diffs);
  }
  return diffs;
}

const summarize = (v) =>
  typeof v === 'object' && v !== null ? (Array.isArray(v) ? `[${v.length} itens]` : '{...}') : v;

async function main() {
  const periods = buildPeriods();
  console.log(`PARIDADE  old=${OLD_BASE}  new=${NEW_BASE}`);
  console.log(`unidades=${UNITS.join(',')}  períodos=${periods.map((p) => p.name).join(',')}  tolerância=${TOLERANCE}\n`);

  let totalCells = 0;
  let greenCells = 0;
  const failures = [];

  for (const unit of UNITS) {
    for (const ep of ENDPOINTS) {
      for (const period of periods) {
        const label = `${unit} × ${ep.service} × ${period.name}`;
        totalCells++;
        try {
          const [oldJson, newJson] = await Promise.all([
            fetchJson(OLD_BASE, oldPathFor(unit), ep.path, period),
            fetchJson(NEW_BASE, unit, ep.path, period),
          ]);
          const diffs = deepDiff(oldJson, newJson);
          if (diffs.length === 0) {
            greenCells++;
            console.log(`✅ ${label}`);
          } else {
            failures.push({ label, count: diffs.length });
            console.log(`❌ ${label} — ${diffs.length} diferenças:`);
            for (const d of diffs.slice(0, MAX_DIFFS)) {
              console.log(`     ${d.path}: antigo=${JSON.stringify(d.old)} novo=${JSON.stringify(d.new)}`);
            }
            if (diffs.length > MAX_DIFFS) console.log(`     ... +${diffs.length - MAX_DIFFS} diffs`);
          }
        } catch (e) {
          failures.push({ label, count: -1 });
          console.log(`💥 ${label} — ERRO: ${e.message}`);
        }
      }
    }
  }

  console.log(`\nRESULTADO: ${greenCells}/${totalCells} células idênticas`);
  if (failures.length) {
    console.log('Falhas:');
    for (const f of failures) console.log(`  - ${f.label}${f.count >= 0 ? ` (${f.count} diffs)` : ' (erro)'}`);
    process.exit(1);
  }
  console.log('🎉 PARIDADE 100%');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
