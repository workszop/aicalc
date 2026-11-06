#!/usr/bin/env node
// Model price update from OpenRouter for index.html (#csvData) and sub/core.js (MODELS). Node 22, no dependencies.
//
//   node scripts/update-prices.mjs                       dry run: prints the markdown diff, changes nothing
//   node scripts/update-prices.mjs --write               writes every change except those flagged "big"
//   node scripts/update-prices.mjs --write --include-big also writes the big ones
//   --only id1,id2      limit the run to these models (our ids)
//   --fixture <path>    read the model list from a file instead of the API (tests)
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

// ─── Helpers ───
function parseArgs(argv) {
  const opts = { write: false, includeBig: false, only: null, fixture: null, root: resolve(HERE, '..'), today: PriceSync.today() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--write') opts.write = true;
    else if (a === '--include-big') opts.includeBig = true;
    else if (a === '--only') opts.only = new Set(value().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--fixture') opts.fixture = resolve(value());
    else if (a === '--root') opts.root = resolve(value());
    else if (a === '--today') { opts.today = value(); if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.today)) throw new Error('--today must be YYYY-MM-DD'); }
    else if (a === '--help' || a === '-h') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n')); process.exit(0); }
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}
async function loadFeed(opts) {
  if (opts.fixture) return JSON.parse(readFileSync(opts.fixture, 'utf8'));
  const res = await fetch(PriceSync.FEED_URL, { signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`OpenRouter answered HTTP ${res.status}`);
  return res.json();
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
function markdown(opts, rows, missing, candidates, written) {
  const out = [];
  out.push(`# Aktualizacja cen z OpenRouter (${opts.today})`, '');
  out.push(`Źródło: ${opts.fixture ? 'plik ' + opts.fixture : PriceSync.FEED_URL}. OpenRouter może pokazywać cenę zewnętrznego hosta, a nie dostawcy modelu: przed scaleniem sprawdź ceny u dostawcy. Ceny dla długiego kontekstu (tier_*) i poza szczytem (offpeak_*) nie są aktualizowane.`, '');
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
  out.push('## Nowe modele (do decyzji)', '');
  if (!candidates.length) out.push('Brak nowych modeli.', '');
  else {
    out.push('Skrypt ich nie dodaje. Dodaj ręcznie do `#csvData` i `SubCore.MODELS`, jeśli są potrzebne.', '');
    out.push('| OpenRouter id | Nazwa | Rodzina | Wejście USD/1M | Wyjście USD/1M | Kontekst |', '|---|---|---|---|---|---|');
    candidates.forEach((c) => out.push(`| \`${c.openrouter}\` | ${cell(c.name)} | ${c.family} | ${c.pin} | ${c.pout} | ${c.ctx} |`));
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

  const feed = await loadFeed(opts);
  const orMap = PriceSync.parseOpenRouter(feed);
  const models = csvModels(match[2]);
  const inScope = (id) => !opts.only || opts.only.has(id);
  const diff = PriceSync.diffModels(models, orMap).filter((r) => inScope(r.id));
  const rows = diff.filter((r) => !r.missing);
  const missing = diff.filter((r) => r.missing);
  const candidates = PriceSync.newModelCandidates(coreModels(coreSource), feed, 15, opts.today);
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
  console.log(markdown(opts, rows, missing, candidates, written));
}

main().catch((error) => {
  console.error('update-prices: ' + (error && error.message || error));
  process.exit(1);
});
