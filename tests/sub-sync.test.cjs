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

// ─── sub/sub.css tokens ───
const trimEnds = (text) => text.split('\n').map((line) => line.replace(/\s+$/, '')).join('\n');
const firstRootBlock = (text) => {
  const start = text.indexOf(':root {');
  assert.ok(start >= 0, 'a :root { block exists');
  const end = text.indexOf('\n}', start);
  assert.ok(end > start, ':root block is closed');
  return text.slice(start, end + 2);
};
const indexRoot = trimEnds(firstRootBlock(html));
const subCssPath = path.join(__dirname, '../sub/sub.css');
assert.ok(fs.existsSync(subCssPath), 'sub/sub.css exists');
const subCss = trimEnds(fs.readFileSync(subCssPath, 'utf8'));
assert.ok(subCss.includes(indexRoot), "sub/sub.css contains index.html's :root block verbatim");
const cssOutsideRoot = subCss.replace(indexRoot, '');
const strayHex = cssOutsideRoot.match(/#[0-9a-fA-F]{3,8}\b/g);
assert.equal(strayHex, null, 'no hex colours outside the :root block: ' + strayHex);

// ─── sub/ui.js i18n parity (ui.js loaded in vm with a minimal document stub) ───
const uiCtx = vm.createContext({ console, URLSearchParams, Intl, SubCore: sub, document: { documentElement: {}, body: { dataset: {} } } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../sub/ui.js'), 'utf8'), uiCtx);
const ui = vm.runInContext('globalThis.SubUI', uiCtx);
assert.deepEqual(Object.keys(ui.T.en), Object.keys(ui.T.pl), 'T.pl and T.en have the same keys in the same order');
Object.entries(ui.T).forEach(([lang, table]) => Object.entries(table).forEach(([key, value]) => {
  assert.ok(typeof value === 'string' && value.length > 0, `T.${lang}.${key} is a non-empty string`);
  assert.ok(!value.includes('\u2014'), `T.${lang}.${key} has no em-dash`);
}));
// ─── page strings registered with SubUI.addStrings ───
assert.equal(typeof ui.addStrings, 'function', 'SubUI.addStrings exists');
assert.throws(() => ui.addStrings({ pl: { onlyPl: 'x' }, en: {} }), /key/i, 'addStrings rejects mismatched pl/en keys');
const STOP = new Error('stop after addStrings');
function pageStrings(file) {
  const captured = [];
  const realAdd = ui.addStrings;
  ui.addStrings = (strings) => { captured.push(strings); realAdd(strings); throw STOP; };
  try { vm.runInContext(fs.readFileSync(path.join(__dirname, '../sub/' + file), 'utf8'), uiCtx); }
  catch (error) { if (error !== STOP) throw error; }
  finally { ui.addStrings = realAdd; }
  assert.equal(captured.length, 1, file + ' registers its strings with SubUI.addStrings before touching the DOM');
  return captured[0];
}
['roi.js', 'seats.js'].forEach((file) => {
  const strings = pageStrings(file);
  assert.deepEqual(Object.keys(strings.en), Object.keys(strings.pl), file + ': pl and en string keys match');
  Object.entries(strings).forEach(([lang, table]) => Object.entries(table).forEach(([key, value]) => {
    assert.ok(typeof value === 'string' && value.length > 0, `${file} ${lang}.${key} is a non-empty string`);
    assert.ok(!value.includes('\u2014'), `${file} ${lang}.${key} has no em-dash`);
    assert.ok(!Object.prototype.hasOwnProperty.call(ui.T.pl, key) || ui.T.pl[key] === strings.pl[key], `${file} ${key} does not shadow a shared key`);
  }));
  assert.ok(ui.T.pl[Object.keys(strings.pl)[0]], 'after addStrings the page keys are reachable through t()');
});
console.log('sub-sync tests passed');
