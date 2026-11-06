#!/usr/bin/env node
// Model price update for index.html (#csvData) and sub/core.js (MODELS). Node 22, no dependencies.
// Prices are the model creator's own (DeepSeek, OpenAI, Anthropic, Alibaba for Qwen), read through OpenRouter:
// the model list finds the models, /api/v1/models/{id}/endpoints gives the creator's endpoint.
//
//   node scripts/update-prices.mjs                       dry run: prints the markdown diff, changes nothing
//   node scripts/update-prices.mjs --write               writes every change except those flagged "big"
//   node scripts/update-prices.mjs --write --include-big also writes the big ones
//   --only id1,id2      limit the run to these models (our ids)
//   --fixture <path>    read the model list from a file instead of the API (tests)
//   --endpoints-dir <d> read endpoints from <d>/<id with / as __>.json instead of the API
//                       (default with --fixture: the "endpoints" directory next to the list file)
//   --root <dir>        repository root to read and write (default: this script's repository)
//   --today YYYY-MM-DD  date written to checked_at (default: today, UTC)
//
// New models are never added here; they are only listed "do decyzji". Exit code 0 unless something failed.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// ─── Constants ───
const HERE = dirname(fileURLToPath(import.meta.url));
const PriceSync = createRequire(import.meta.url)(join(HERE, '../sub/prices.js'));
const CSV_RE = /(<script id="csvData"[^>]*>)([\s\S]*?)(<\/script>)/;
const FIELD_LABEL = { pin: 'wejście USD/1M', pout: 'wyjście USD/1M', ctx: 'okno kontekstu', maxOutput: 'maks. wyjście' };
const FLAG_LABEL = { big: 'duża zmiana, sprawdź u dostawcy', tiersKept: 'ceny dla długiego kontekstu nie są aktualizowane' };
const CORE_KEYS = { pin: 'pin', pout: 'pout', ctx: 'ctx', maxOutput: 'maxOutput' };
const NO_TOKENIZER = 'Brak współczynnika tokenizera tej rodziny – dodanie po pomiarze';
const LIST_TIMEOUT_MS = 30000;
const ENDPOINTS_TIMEOUT_MS = 20000;

// ─── Helpers ───
function parseArgs(argv) {
  const opts = { write: false, includeBig: false, only: null, fixture: null, endpointsDir: null, root: resolve(HERE, '..'), today: PriceSync.today() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--write') opts.write = true;
    else if (a === '--include-big') opts.includeBig = true;
    else if (a === '--only') opts.only = new Set(value().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--fixture') opts.fixture = resolve(value());
    else if (a === '--endpoints-dir') opts.endpointsDir = resolve(value());
    else if (a === '--root') opts.root = resolve(value());
    else if (a === '--today') { opts.today = value(); if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.today)) throw new Error('--today must be YYYY-MM-DD'); }
    else if (a === '--help' || a === '-h') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 16).join('\n')); process.exit(0); }
    else throw new Error(`unknown option ${a}`);
  }
  if (opts.fixture && !opts.endpointsDir) opts.endpointsDir = join(dirname(opts.fixture), 'endpoints');
  return opts;
}
async function getJson(url, ms) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`OpenRouter answered HTTP ${res.status} for ${url}`);
  return res.json();
}
// The list and each model's endpoints, from the API or from files (tests).
function sources(opts) {
  return {
    list: async () => (opts.fixture ? JSON.parse(readFileSync(opts.fixture, 'utf8')) : getJson(PriceSync.FEED_URL, LIST_TIMEOUT_MS)),
    endpoints: async (id) => (opts.endpointsDir
      ? JSON.parse(readFileSync(join(opts.endpointsDir, PriceSync.endpointsFile(id)), 'utf8'))
      : getJson(PriceSync.endpointsUrl(id), ENDPOINTS_TIMEOUT_MS)),
  };
}
// Models from the CSV text, with the fields the diff needs (the full validation lives in index.html).
function csvModels(text) {
  const recs = PriceSync.csvRecords(text.replace(/^﻿/, ''));
  const head = recs[0].cells.map((h) => h.trim());
  const at = (r, col) => (r.cells[head.indexOf(col)] ?? '').trim();
  return recs.slice(1).map((r) => ({
    id: at(r, 'id'), name: at(r, 'nazwa'), openrouter: at(r, 'openrouter_id'),
    pin: Number(at(r, 'cena_wejscie_per_1M_USD')), pout: Number(at(r, 'cena_wyjscie_per_1M_USD')),
    ctx: Number(at(r, 'okno_kontekstu')), maxOutput: Number(at(r, 'max_output')),
    tier: at(r, 'tier_above') ? { above: Number(at(r, 'tier_above')) } : null,
    checkedAt: at(r, 'checked_at'), source: at(r, 'source'),
  }));
}
function coreModels(source) {
  const ctx = vm.createContext({});
  vm.runInContext(source, ctx);
  return JSON.parse(JSON.stringify(vm.runInContext('globalThis.SubCore.MODELS', ctx)));
}
// Rewrites one MODELS entry line in place: only the values change, the formatting stays.
function updateCoreSource(source, id, values) {
  const lines = source.split('\n');
  const i = lines.findIndex((l) => l.includes(`{ id: '${id}',`));
  if (i < 0) throw new Error(`sub/core.js has no MODELS entry ${id}`);
  let line = lines[i];
  Object.entries(values).forEach(([key, v]) => {
    const re = key === 'checkedAt' ? /(\bcheckedAt: )'[^']*'/ : new RegExp(`(\\b${key}: )[-0-9.e+]+`);
    if (!re.test(line)) throw new Error(`sub/core.js ${id} has no ${key}`);
    line = line.replace(re, key === 'checkedAt' ? `$1'${v}'` : `$1${v}`);
  });
  lines[i] = line;
  return lines.join('\n');
}
function selfCheck(csvText, coreSource) {
  const a = csvModels(csvText);
  const b = coreModels(coreSource);
  if (a.length !== b.length) return [`CSV has ${a.length} models, sub/core.js ${b.length}`];
  const keys = ['id', 'pin', 'pout', 'ctx', 'maxOutput', 'checkedAt', 'openrouter'];
  const out = [];
  a.forEach((m, i) => keys.forEach((k) => { if (m[k] !== b[i][k]) out.push(`${m.id}.${k}: CSV ${m[k]} vs core ${b[i][k]}`); }));
  return out;
}
const fmt = (v) => (typeof v === 'number' ? String(v) : '');
const pct = (v) => (v === null ? 'nowa cena' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
const cell = (s) => String(s).replace(/\|/g, '\\|');

// ─── Report ───
function markdown(opts, rows, missing, noCreator, candidates, written) {
  const out = [];
  const list = opts.fixture ? 'plik ' + opts.fixture : PriceSync.FEED_URL;
  const endpoints = opts.endpointsDir ? 'katalog ' + opts.endpointsDir : PriceSync.FEED_URL + '/{id}/endpoints';
  out.push(`# Aktualizacja cen z OpenRouter (${opts.today})`, '');
  out.push('Ceny pochodzą od twórcy modelu (np. DeepSeek, OpenAI, Anthropic), pobrane przez OpenRouter. Dla każdego modelu brany jest tylko endpoint twórcy (tag `' + Object.values(PriceSync.CREATOR_TAG).join('`, `') + '`), nigdy cena innego hosta. Ceny dla długiego kontekstu (tier_*) i poza szczytem (offpeak_*) nie są aktualizowane.', '');
  out.push(`Źródła: lista modeli: ${list}; endpointy: ${endpoints}.`, '');
  out.push(opts.write ? 'Tryb: zapis (`--write`' + (opts.includeBig ? ' `--include-big`' : '') + ').' : 'Tryb: podgląd, nic nie zostało zapisane.', '');
  out.push('## Zmiany cen', '');
  if (!rows.length) out.push('Ceny są aktualne.', '');
  else {
    out.push('| Model | Pole | Było | Jest | Zmiana | Uwagi | Status |', '|---|---|---|---|---|---|---|');
    rows.forEach((r) => {
      const big = r.flags.includes('big');
      const status = written.has(r) ? (opts.write ? 'zapisano' : 'do zapisu') : big ? 'do decyzji' : 'pominięto';
      out.push(`| ${cell(r.name)} (\`${r.id}\`) | ${FIELD_LABEL[r.field]} | ${fmt(r.old)} | ${fmt(r.next)} | ${pct(r.pctChange)} | ${r.flags.map((f) => FLAG_LABEL[f]).join('; ')} | ${status} |`);
    });
    out.push('');
  }
  out.push('## Brak w OpenRouter', '');
  out.push(missing.length ? missing.map((m) => `- ${cell(m.name)} (\`${m.id}\`): brak \`${m.openrouter}\``).join('\n') : 'Wszystkie zmapowane modele są w OpenRouter.', '');
  out.push('## Brak ceny twórcy w OpenRouter', '');
  out.push(noCreator.length
    ? 'Te modele są w OpenRouter, ale bez endpointu twórcy albo zapytanie się nie udało. Ich ceny zostają bez zmian.\n\n' + noCreator.map((m) => `- ${cell(m.name)} (\`${m.id}\`): \`${m.openrouter}\``).join('\n')
    : 'Wszystkie zmapowane modele mają cenę twórcy.', '');
  out.push('## Nowe modele (do decyzji)', '');
  if (!candidates.length) out.push('Brak nowych modeli.', '');
  else {
    out.push('Skrypt ich nie dodaje. Dodaj ręcznie do `#csvData` i `SubCore.MODELS`, jeśli są potrzebne.', '');
    out.push('| OpenRouter id | Nazwa | Rodzina | Wejście USD/1M | Wyjście USD/1M | Kontekst | Uwagi |', '|---|---|---|---|---|---|---|');
    candidates.forEach((c) => out.push(`| \`${c.openrouter}\` | ${cell(c.name)} | ${c.family} | ${c.pin} | ${c.pout} | ${c.ctx} | ${c.canAdd ? '' : NO_TOKENIZER} |`));
    out.push('');
  }
  return out.join('\n');
}

// ─── Main ───
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const indexPath = join(opts.root, 'index.html');
  const corePath = join(opts.root, 'sub/core.js');
  const html = readFileSync(indexPath, 'utf8');
  const coreSource = readFileSync(corePath, 'utf8');
  const match = html.match(CSV_RE);
  if (!match) throw new Error('index.html has no #csvData block');
  const before = selfCheck(match[2], coreSource);
  if (before.length) throw new Error('CSV and sub/core.js disagree before the update:\n' + before.join('\n'));

  const models = csvModels(match[2]);
  const data = await PriceSync.fetchCreatorData(models, sources(opts));
  const update = PriceSync.creatorUpdate(models, data, 15, opts.today);
  const inScope = (r) => !opts.only || opts.only.has(r.id);
  const rows = update.rows.filter(inScope);
  const missing = update.missing.filter(inScope);
  const noCreator = update.noCreator.filter(inScope);
  const candidates = update.candidates;
  const accepted = rows.filter((r) => opts.includeBig || !r.flags.includes('big'));
  const written = new Set(accepted);

  if (opts.write && accepted.length) {
    const next = PriceSync.applyUpdate(models, { changes: accepted }, opts.today);
    const csvOut = PriceSync.updateCsvText(match[2], next);
    let coreOut = coreSource;
    const byId = {};
    accepted.forEach((r) => { (byId[r.id] = byId[r.id] || { checkedAt: opts.today })[CORE_KEYS[r.field]] = r.next; });
    Object.entries(byId).forEach(([id, values]) => { coreOut = updateCoreSource(coreOut, id, values); });
    const after = selfCheck(csvOut, coreOut);
    if (after.length) throw new Error('self-check failed, nothing written:\n' + after.join('\n'));
    writeFileSync(indexPath, html.replace(CSV_RE, (_, a, _b, c) => a + csvOut + c));
    writeFileSync(corePath, coreOut);
  }
  console.log(markdown(opts, rows, missing, noCreator, candidates, written));
}

main().catch((error) => {
  console.error('update-prices: ' + (error && error.message || error));
  process.exit(1);
});
