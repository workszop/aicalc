#!/usr/bin/env node
/* scripts/update-prices.mjs --write on a temporary copy of index.html and sub/core.js (never the real files). */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts/update-prices.mjs');
const FIXTURE = path.join(__dirname, 'fixtures/openrouter-models.json');
const ENDPOINTS = path.join(__dirname, 'fixtures/endpoints');
const TODAY = '2026-11-06';

function copyRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicalc-prices-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dir, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'sub/core.js'), path.join(dir, 'sub/core.js'));
  return dir;
}
// A copy of the endpoint fixtures with edit(json by id) applied, for the off-the-happy-path cases.
function editedEndpoints(edit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicalc-endpoints-'));
  fs.readdirSync(ENDPOINTS).forEach((f) => {
    const json = JSON.parse(fs.readFileSync(path.join(ENDPOINTS, f), 'utf8'));
    const out = edit(json.data.id, json);
    if (out) fs.writeFileSync(path.join(dir, f), JSON.stringify(out));
  });
  return dir;
}
const run = (dir, ...args) => execFileSync(process.execPath, [SCRIPT, '--root', dir, '--fixture', FIXTURE, '--today', TODAY, ...args], { encoding: 'utf8' });
// The same comparison as tests/sub-sync.test.cjs, on the copy.
function load(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const js = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const idx = vm.createContext({ console });
  vm.runInContext(js.slice(0, js.indexOf('// ─── State')) + js.slice(js.indexOf('// CSV parser'), js.indexOf('// ─── Render')), idx);
  const csv = html.match(/<script id="csvData"[^>]*>([\s\S]*?)<\/script>/)[1];
  const index = vm.runInContext(`modelsFromCsv(${JSON.stringify(csv)})`, idx);
  const sub = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(dir, 'sub/core.js'), 'utf8'), sub);
  return { html, csv, index, core: vm.runInContext('SubCore.MODELS', sub) };
}
function assertInSync(state, label) {
  assert.equal(state.core.length, state.index.length, label + ': same number of models');
  state.index.forEach((m, i) => {
    const c = state.core[i];
    ['id', 'name', 'pin', 'pout', 'ctx', 'maxOutput', 'family', 'alwaysThinks', 'checkedAt', 'source', 'openrouter'].forEach((k) => assert.equal(c[k], m[k], `${label}: ${m.id}.${k}`));
    assert.equal(c.tierAbove, m.tier ? m.tier.above : null, `${label}: ${m.id} tier`);
  });
}

const realIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const realCore = fs.readFileSync(path.join(ROOT, 'sub/core.js'), 'utf8');

// dry run changes nothing; the endpoints directory defaults to the one next to the list fixture
const dry = copyRepo();
const dryOut = run(dry);
assert.match(dryOut, /Tryb: podgląd/);
assert.match(dryOut, /Ceny pochodzą od twórcy modelu \(np\. DeepSeek, OpenAI, Anthropic\), pobrane przez OpenRouter\./);
assert.match(dryOut, /endpointy: katalog .*fixtures[\\/]endpoints/);
assert.ok(!/duża zmiana/.test(dryOut), 'real creator data: nothing is flagged big');
assert.equal((dryOut.match(/\| do zapisu \|/g) || []).length, 5, 'Haiku output (edited fixture) and the two DeepSeek ctx / max output pairs');
assert.match(dryOut, /## Brak ceny twórcy w OpenRouter\n\nWszystkie zmapowane modele mają cenę twórcy\./);
assert.match(dryOut, /## Nowe modele \(do decyzji\)/);
assert.match(dryOut, /\| `anthropic\/claude-haiku-5\.5` \| Anthropic Claude Haiku 5\.5 \| claudeNew \| 0\.1 \| 0\.5 \| 1000000 \|  \|/, 'candidate priced by its creator');
assert.match(dryOut, /\| `google\/gemini-3\.8-flash` \| Google Gemini 3\.8 Flash \| gemini \| 0\.75 \| 3\.75 \| 1048576 \| Brak współczynnika tokenizera Gemini – dodanie po pomiarze \|/, 'Google candidate listed with the tokenizer note');
assert.ok(!/qwen\//.test(dryOut.split('## Nowe modele')[1]), 'no qwen candidates');
assert.ok(!/gpt-6-luna/.test(dryOut), 'a candidate without a creator endpoint is not listed');
assert.equal(fs.readFileSync(path.join(dry, 'index.html'), 'utf8'), realIndex, 'dry run leaves index.html alone');
assert.ok(!/—/.test(dryOut), 'no em-dash in the report');

// --write writes the normal changes
const dir = copyRepo();
const before = load(dir);
run(dir, '--write');
const after = load(dir);
assertInSync(after, 'after --write');
const pro = after.index.find((m) => m.id === 'deepseek-v4-pro');
assert.deepEqual([pro.pin, pro.pout, pro.ctx, pro.maxOutput], [1.32, 3.96, 1048576, 393216], 'DeepSeek V4 Pro: creator ctx / max output written, prices unchanged');
assert.equal(pro.checkedAt, TODAY);
assert.equal(pro.note, 'Cena twórcy modelu (z OpenRouter).');
const haiku = after.index.find((m) => m.id === 'claude-haiku-4-5-20251001');
assert.equal(haiku.pout, 5.5, 'normal change written');
assert.equal(haiku.checkedAt, TODAY);
assert.equal(pro.offPeak.pin, 0.66, 'off-peak prices kept');
assert.equal(after.index.find((m) => m.id === 'deepseek-flash').ctx, 1048576);
assert.equal(after.index.length, before.index.length, 'no new models added');
const lunaLine = (s) => s.split('\n').find((l) => l.includes("'gpt-5.6-luna'") || l.includes(',gpt-5.6-luna,'));
assert.equal(lunaLine(after.csv), lunaLine(before.csv), 'untouched CSV rows unchanged');
assert.equal(after.html.replace(after.csv, ''), before.html.replace(before.csv, ''), 'only the CSV block of index.html changes');

// second run: nothing left
const again = run(dir, '--write');
assert.match(again, /Ceny są aktualne\./, 'second run finds no change');
assert.deepEqual(load(dir).csv, after.csv, 'second run leaves the files as they were');

// a big creator price change (synthetic) is left for a decision; a model without a creator endpoint or whose
// file is unreadable goes to its own bucket and keeps its values
const odd = editedEndpoints((id, json) => {
  if (id === 'deepseek/deepseek-v4-pro-0813') json.data.endpoints.find((e) => e.tag === 'deepseek').pricing.prompt = '0.0000001165';
  if (id === 'anthropic/claude-opus-5') json.data.endpoints = json.data.endpoints.filter((e) => e.tag !== 'anthropic');
  if (id === 'anthropic/claude-sonnet-5') return null;
  return json;
});
const bigDir = copyRepo();
const bigOut = run(bigDir, '--endpoints-dir', odd, '--write');
assert.equal((bigOut.match(/\| do decyzji \|/g) || []).length, 3, 'V4 Pro: pin, ctx, max output flagged big');
assert.match(bigOut, /## Brak ceny twórcy w OpenRouter\n\nTe modele są w OpenRouter, ale bez endpointu twórcy/);
assert.match(bigOut, /- Anthropic Claude Opus 5 \(`claude-opus-5`\): `anthropic\/claude-opus-5`/);
assert.match(bigOut, /- Anthropic Claude Sonnet 5 \(`claude-sonnet-5`\): `anthropic\/claude-sonnet-5`/);
const bigState = load(bigDir);
assertInSync(bigState, 'after a write with doubtful data');
assert.deepEqual([bigState.index.find((m) => m.id === 'deepseek-v4-pro').pin, bigState.index.find((m) => m.id === 'deepseek-v4-pro').ctx], [1.32, 1000000], 'a doubtful model is not written');
assert.equal(bigState.index.find((m) => m.id === 'claude-opus-5').pin, 5, 'no fallback to another host');
assert.equal(bigState.index.find((m) => m.id === 'deepseek-flash').ctx, 1048576, 'the rest is still written');

// --include-big and --only
const inc = copyRepo();
run(inc, '--endpoints-dir', odd, '--write', '--include-big', '--only', 'deepseek-v4-pro');
const incState = load(inc);
assertInSync(incState, 'after --include-big');
assert.equal(incState.index.find((m) => m.id === 'deepseek-v4-pro').pin, 0.1165, '--include-big writes the big change');
assert.equal(incState.index.find((m) => m.id === 'deepseek-flash').ctx, 1000000, '--only leaves other models alone');
assert.match(run(inc), /deepseek-flash/, 'dry run after a scoped write still runs');

// a list that cannot be read is a total failure (exit 1, nothing written)
const fail = copyRepo();
assert.throws(() => execFileSync(process.execPath, [SCRIPT, '--root', fail, '--fixture', path.join(fail, 'nope.json'), '--write'], { encoding: 'utf8', stdio: 'pipe' }), /update-prices:/);
assert.equal(fs.readFileSync(path.join(fail, 'index.html'), 'utf8'), realIndex, 'total failure writes nothing');

// the real repository files were never touched
assert.equal(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), realIndex);
assert.equal(fs.readFileSync(path.join(ROOT, 'sub/core.js'), 'utf8'), realCore);
[dry, dir, bigDir, inc, fail, odd].forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
console.log('update-prices script tests passed');
