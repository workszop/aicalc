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
const TODAY = '2026-11-06';

function copyRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicalc-prices-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dir, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'sub/core.js'), path.join(dir, 'sub/core.js'));
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

// dry run changes nothing
const dry = copyRepo();
const dryOut = run(dry);
assert.match(dryOut, /Tryb: podgląd/);
assert.match(dryOut, /duża zmiana, sprawdź u dostawcy/);
assert.match(dryOut, /## Nowe modele \(do decyzji\)/);
assert.equal(fs.readFileSync(path.join(dry, 'index.html'), 'utf8'), realIndex, 'dry run leaves index.html alone');
assert.ok(!/\u2014/.test(dryOut), 'no em-dash in the report');

// --write skips big changes
const dir = copyRepo();
const before = load(dir);
const out = run(dir, '--write');
assert.match(out, /\| do decyzji \|/, 'big change listed for a decision');
const after = load(dir);
assertInSync(after, 'after --write');
const pro = after.index.find((m) => m.id === 'deepseek-v4-pro');
assert.equal(pro.pin, 1.32, 'big change (1.32 -> 0.111) not written without --include-big');
assert.equal(pro.pout, 4.44, 'normal change written');
assert.equal(pro.checkedAt, TODAY);
assert.equal(pro.offPeak.pin, 0.66, 'off-peak prices kept');
assert.equal(after.index.find((m) => m.id === 'deepseek-flash').ctx, 1048576);
assert.equal(after.index.length, before.index.length, 'no new models added');
const lunaLine = (s) => s.split('\n').find((l) => l.includes("'gpt-5.6-luna'") || l.includes(',gpt-5.6-luna,'));
assert.equal(lunaLine(after.csv), lunaLine(before.csv), 'untouched CSV rows unchanged');
assert.equal(after.html.replace(after.csv, ''), before.html.replace(before.csv, ''), 'only the CSV block of index.html changes');

// second run: nothing left but the big change
const again = run(dir, '--write');
assert.equal((again.match(/\| zapisano \|/g) || []).length, 0, 'second run writes nothing');
assert.equal((again.match(/\| do decyzji \|/g) || []).length, 1, 'only the big change remains');
assert.deepEqual(load(dir).csv, after.csv, 'second run leaves the files as they were');

// --include-big and --only
const big = copyRepo();
run(big, '--write', '--include-big', '--only', 'deepseek-v4-pro');
const bigState = load(big);
assertInSync(bigState, 'after --include-big');
assert.equal(bigState.index.find((m) => m.id === 'deepseek-v4-pro').pin, 0.111, '--include-big writes the big change');
assert.equal(bigState.index.find((m) => m.id === 'deepseek-flash').ctx, 1000000, '--only leaves other models alone');
assert.match(run(big), /Ceny są aktualne|deepseek-flash/, 'dry run after a scoped write still runs');

// the real repository files were never touched
assert.equal(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), realIndex);
assert.equal(fs.readFileSync(path.join(ROOT, 'sub/core.js'), 'utf8'), realCore);
[dry, dir, big].forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
console.log('update-prices script tests passed');
