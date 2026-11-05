const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const js = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const constants = js.slice(0, js.indexOf('// ─── State'));
const core = js.slice(js.indexOf('// CSV parser'), js.indexOf('// ─── Render'));
const csv = html.match(/<script id="csvData"[^>]*>([\s\S]*?)<\/script>/)[1];
const idx = vm.createContext({ console });
vm.runInContext(constants + core, idx);
const indexModels = vm.runInContext(`modelsFromCsv(${JSON.stringify(csv)})`, idx);
const indexTok = vm.runInContext('({ TOK_PER_WORD, BASE_FAMILY, EN_WORD_FACTOR })', idx);

const subCtx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../sub/core.js'), 'utf8'), subCtx);
const sub = vm.runInContext('globalThis.SubCore', subCtx);

assert.equal(sub.MODELS.length, indexModels.length, 'same number of models');
indexModels.forEach((m, i) => {
  const expected = {
    id: m.id, name: m.name, pin: m.pin, pout: m.pout, ctx: m.ctx, maxOutput: m.maxOutput,
    family: m.family, alwaysThinks: m.alwaysThinks,
    tierAbove: m.tier ? m.tier.above : null, tierIn: m.tier ? m.tier.pin : null, tierOut: m.tier ? m.tier.pout : null,
    checkedAt: m.checkedAt, source: m.source,
  };
  const actual = {};
  Object.keys(expected).forEach((k) => { actual[k] = sub.MODELS[i][k]; });
  assert.deepEqual(actual, expected, `model ${m.id} matches index.html`);
});
assert.deepEqual(JSON.parse(JSON.stringify(sub.TOK_PER_WORD)), JSON.parse(JSON.stringify(indexTok.TOK_PER_WORD)), 'TOK_PER_WORD matches');
assert.equal(sub.BASE_FAMILY, indexTok.BASE_FAMILY);
assert.equal(sub.EN_WORD_FACTOR, indexTok.EN_WORD_FACTOR);
console.log('sub-sync tests passed');
