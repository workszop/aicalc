#!/usr/bin/env node
/* Pure price-update logic (sub/prices.js) against a trimmed real OpenRouter snapshot. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const PriceSync = require(path.join(ROOT, 'sub/prices.js'));
const SubCore = require(path.join(ROOT, 'sub/core.js'));
const feed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/openrouter-models.json'), 'utf8'));
const TODAY = '2026-11-06';
const clone = (v) => JSON.parse(JSON.stringify(v));

// index.html models (built-in CSV through the real modelsFromCsv)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const idx = vm.createContext({ console });
vm.runInContext(js.slice(0, js.indexOf('// ─── State')) + js.slice(js.indexOf('// CSV parser'), js.indexOf('// ─── Render')), idx);
const csv = html.match(/<script id="csvData"[^>]*>([\s\S]*?)<\/script>/)[1];
const modelsFromCsv = (text) => vm.runInContext(`modelsFromCsv(${JSON.stringify(text)})`, idx);
const indexModels = modelsFromCsv(csv);

// ─── round6 / parseOpenRouter ───
assert.equal(PriceSync.round6(0.19999999), 0.2);
assert.equal(PriceSync.round6(1.3200000000000003), 1.32);
const orMap = PriceSync.parseOpenRouter(feed);
assert.ok(orMap instanceof Map, 'parseOpenRouter returns a Map');
assert.deepEqual(orMap.get('openai/gpt-5.6-luna'), { pin: 0.2, pout: 1.2, ctx: 1050000, maxOutput: 128000, name: 'OpenAI: GPT-5.6 Luna', created: 1783590864 });
assert.equal(orMap.get('deepseek/deepseek-v4-pro-0813').pin, 0.111, 'per-token string becomes a rounded per-1M price');
assert.equal(orMap.get('deepseek/deepseek-v4-pro-0813').pout, 4.44);
assert.equal(orMap.get('deepseek/deepseek-v4.1-flash').pin, 0.0486);
assert.ok(![...orMap.keys()].some((id) => id.endsWith(':batch')), ':batch variants are skipped');
assert.ok(![...orMap.keys()].some((id) => id.startsWith('~')), '~ aliases are skipped');
assert.ok(!orMap.has('openrouter/auto'), 'negative (variable) prices are skipped');
[null, 42, 'x', {}, { data: 'no' }, { data: [{ name: 'no id' }] }, { data: [{ id: 'a/b', pricing: 'x' }] }].forEach((bad) => {
  assert.throws(() => PriceSync.parseOpenRouter(bad), /OpenRouter/, `malformed shape rejected: ${JSON.stringify(bad)}`);
});

// ─── mapping ───
const MAPPING = {
  'gpt-5.6-luna': 'openai/gpt-5.6-luna', 'gpt-5.6-terra': 'openai/gpt-5.6-terra', 'gpt-5.6-sol': 'openai/gpt-5.6-sol',
  'gpt-6-astra': 'openai/gpt-6-astra', 'claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4.5',
  'claude-sonnet-5': 'anthropic/claude-sonnet-5', 'claude-opus-5': 'anthropic/claude-opus-5', 'claude-fable-5-1': 'anthropic/claude-fable-5.1',
  'deepseek-flash': 'deepseek/deepseek-v4.1-flash-1017', 'deepseek-v4-pro': 'deepseek/deepseek-v4-pro-0813',
};
assert.equal(SubCore.MODELS.length, 10);
SubCore.MODELS.forEach((m) => assert.equal(m.openrouter, MAPPING[m.id], `core ${m.id} maps to ${MAPPING[m.id]}`));
indexModels.forEach((m) => assert.equal(m.openrouter, MAPPING[m.id], `index ${m.id} maps to ${MAPPING[m.id]}`));
Object.values(MAPPING).forEach((orId) => assert.ok(orMap.has(orId), `fixture carries ${orId}`));
// a CSV without the openrouter_id column still loads
const header = csv.replace(/^﻿/, '').split('\n')[0].split(',');
const col = header.indexOf('openrouter_id');
assert.ok(col >= 0, 'built-in CSV has an openrouter_id column');
const legacyCsv = csv.replace(/^﻿/, '').trim().split('\n').map((line) => line.split(',').filter((_, i) => i !== col).join(',')).join('\n');
const legacy = modelsFromCsv(legacyCsv);
assert.equal(legacy.length, 10, 'CSV without openrouter_id loads');
assert.ok(legacy.every((m) => m.openrouter === ''), 'missing column means no mapping');

// ─── diffModels ───
const diff = PriceSync.diffModels(SubCore.MODELS, orMap, TODAY);
const rows = diff.filter((r) => !r.missing);
assert.ok(rows.every((r) => ['pin', 'pout', 'ctx', 'maxOutput'].includes(r.field)), 'only the four fields are diffed');
assert.ok(rows.every((r) => r.old !== r.next), 'only real changes');
const row = (id, field) => rows.find((r) => r.id === id && r.field === field);
assert.ok(!rows.some((r) => r.id.startsWith('gpt-5.6')), 'unchanged GPT-5.6 rows are not reported');
const proIn = row('deepseek-v4-pro', 'pin');
assert.equal(proIn.old, 1.32);
assert.equal(proIn.next, 0.111);
assert.equal(proIn.openrouter, 'deepseek/deepseek-v4-pro-0813');
assert.equal(proIn.name, 'DeepSeek V4 Pro 0813');
assert.ok(Math.abs(proIn.pctChange - (-91.590909)) < 1e-4, `pctChange ${proIn.pctChange}`);
assert.ok(proIn.flags.includes('big'), 'DeepSeek V4 Pro input change is flagged big');
assert.ok(row('deepseek-v4-pro', 'pout').flags.includes('big'), 'pout +12% is flagged big too: a big jump in another price of the same model makes its whole feed entry doubtful');
const proMax = rows.find((r) => r.id === 'deepseek-v4-pro' && r.field === 'maxOutput');
if (proMax) assert.ok(proMax.flags.includes('big'), 'DeepSeek V4 Pro max output change is flagged big');
// a big context or max-output change alone is flagged big (not only prices)
const ctxBig = clone(SubCore.MODELS); const luna = ctxBig.find((m) => m.id === 'gpt-5.6-luna'); luna.ctx = 400000;
const ctxBigRow = PriceSync.diffModels(ctxBig, orMap, TODAY).find((r) => r.id === 'gpt-5.6-luna' && r.field === 'ctx');
assert.deepEqual(ctxBigRow.flags, ['big'], 'context 400000 -> 1050000 is flagged big');
assert.ok(!row('deepseek-v4-pro', 'pin').flags.includes('tiersKept'), 'no tiers, no tiersKept');
const ctxRow = row('deepseek-flash', 'ctx');
assert.deepEqual([ctxRow.old, ctxRow.next, ctxRow.flags], [1000000, 1048576, []], 'small context change (+4.9%) is reported, not flagged');
// a relative difference below 1e-9 does not count
const nearly = clone(SubCore.MODELS);
nearly[0].pin = 0.2 * (1 + 1e-12);
assert.ok(!PriceSync.diffModels(nearly, orMap, TODAY).some((r) => r.id === 'gpt-5.6-luna'), 'float noise is not a change');
// tier model price change flags tiersKept (index shape with tier object and core shape with tierAbove)
const tierCore = clone(SubCore.MODELS); tierCore[0].pin = 0.25;
const tierRow = PriceSync.diffModels(tierCore, orMap, TODAY).find((r) => r.id === 'gpt-5.6-luna' && r.field === 'pin');
assert.deepEqual(tierRow.flags, ['tiersKept'], 'core: tier model price change -> tiersKept (20% is not big)');
const tierIdx = clone(indexModels); tierIdx[0].pout = 0.6;
const tierIdxRow = PriceSync.diffModels(tierIdx, orMap, TODAY).find((r) => r.id === 'gpt-5.6-luna' && r.field === 'pout');
assert.deepEqual(tierIdxRow.flags.sort(), ['big', 'tiersKept'], 'index: tier model +100% -> big and tiersKept');
// missing models
const withMissing = clone(SubCore.MODELS); withMissing[1].openrouter = 'openai/gpt-gone';
const missing = PriceSync.diffModels(withMissing, orMap, TODAY).filter((r) => r.missing);
assert.deepEqual(missing, [{ id: 'gpt-5.6-terra', name: 'OpenAI GPT-5.6 Terra', openrouter: 'openai/gpt-gone', missing: true }], 'a mapped id absent from the feed is reported missing');
const unmapped = clone(SubCore.MODELS); unmapped.forEach((m) => { m.openrouter = ''; });
assert.deepEqual(PriceSync.diffModels(unmapped, orMap, TODAY), [], 'models without a mapping are not diffed');

// ─── newModelCandidates ───
const cands = PriceSync.newModelCandidates(SubCore.MODELS, feed, 15, TODAY);
assert.equal(cands.length, 15, 'at most 15 candidates');
assert.ok(cands.every((c, i) => i === 0 || cands[i - 1].created >= c.created), 'newest first');
assert.equal(cands[0].openrouter, 'openai/gpt-6.1-terra', 'newest candidate first');
const ids = cands.map((c) => c.openrouter);
['openai/gpt-6-luna', 'anthropic/claude-opus-5.5', 'anthropic/claude-sonnet-5.5'].forEach((id) => assert.ok(ids.includes(id), `${id} is a candidate`));
ids.forEach((id) => {
  assert.ok(!id.endsWith(':batch') && !id.startsWith('~'), `${id}: no batch or alias`);
  assert.ok(!/-image|-vl-|guard|-pro|preview/.test(id), `${id}: excluded pattern`);
  assert.ok(/^(openai|anthropic|deepseek|qwen)\//.test(id), `${id}: tokenisable provider`);
  assert.ok(!Object.values(MAPPING).includes(id), `${id}: not already mapped`);
});
assert.ok(!ids.includes('qwen/qwen3.7-flash'), 'the 16th and older candidates are cut');
assert.equal(PriceSync.newModelCandidates(SubCore.MODELS, feed, 3, TODAY).length, 3, 'limit is honoured');
const opus = cands.find((c) => c.openrouter === 'anthropic/claude-opus-5.5');
assert.deepEqual(
  { id: opus.id, name: opus.name, family: opus.family, cls: opus.cls, alwaysThinks: opus.alwaysThinks, pin: opus.pin, pout: opus.pout, ctx: opus.ctx, maxOutput: opus.maxOutput, checkedAt: opus.checkedAt, source: opus.source, note: opus.note, tier: opus.tier, offPeak: opus.offPeak, tierAbove: opus.tierAbove },
  { id: 'claude-opus-5.5', name: 'Anthropic Claude Opus 5.5', family: 'claudeNew', cls: 'standard', alwaysThinks: false, pin: 4, pout: 20, ctx: 1000000, maxOutput: 128000, checkedAt: TODAY, source: 'https://openrouter.ai/anthropic/claude-opus-5.5', note: 'Dodany z OpenRouter, sprawdź cenę u dostawcy.', tier: null, offPeak: null, tierAbove: null },
  'new-model fields');
assert.equal(cands.find((c) => c.openrouter === 'openai/gpt-6.1-terra').name, 'OpenAI GPT-6.1 Terra');
assert.equal(cands.find((c) => c.openrouter === 'openai/gpt-6.1-terra').family, 'openai');
assert.equal(cands.find((c) => c.openrouter === 'qwen/qwen3.8-max-prime').name, 'Qwen3.8 Max Prime', 'no doubled provider word');
assert.equal(cands.find((c) => c.openrouter === 'qwen/qwen3.8-max-prime').family, 'qwen');
assert.equal(cands.find((c) => c.openrouter === 'deepseek/deepseek-v4.1-flash').name, 'DeepSeek V4.1 Flash (OpenRouter)', 'a name that clashes with a model on the list gets a suffix');
assert.equal(cands.find((c) => c.openrouter === 'deepseek/deepseek-v4.1-flash').family, 'deepseek');
const withPreview = clone(feed);
withPreview.data.push({ id: 'openai/gpt-7-preview', name: 'OpenAI: GPT-7 Preview', created: 1999999999, context_length: 1000, pricing: { prompt: '0.000001', completion: '0.000002' }, top_provider: { max_completion_tokens: null } });
withPreview.data.push({ id: 'qwen/qwen9', name: 'Qwen: Qwen9', created: 1999999998, context_length: 2000, pricing: { prompt: '0.000001', completion: '0.000002' }, top_provider: { max_completion_tokens: null } });
const pv = PriceSync.newModelCandidates(SubCore.MODELS, withPreview, 15, TODAY);
assert.ok(!pv.some((c) => c.openrouter.includes('preview')), 'preview models are skipped');
assert.equal(pv[0].maxOutput, 2000, 'missing max_completion_tokens falls back to the context length');

// ─── applyUpdate ───
const before = clone(SubCore.MODELS);
const accepted = rows.filter((r) => !r.flags.includes('big'));
const updated = PriceSync.applyUpdate(SubCore.MODELS, { changes: accepted, added: [opus] }, TODAY);
assert.deepEqual(clone(SubCore.MODELS), before, 'applyUpdate does not mutate the input');
assert.notEqual(updated, SubCore.MODELS);
assert.equal(updated.length, 11, 'added model appended');
assert.equal(updated[10].id, 'claude-opus-5.5');
const pro = updated.find((m) => m.id === 'deepseek-v4-pro');
assert.equal(pro.pin, 1.32, 'big change not accepted, not applied');
assert.equal(pro.pout, 3.96, 'a doubtful model keeps its built-in values');
const haiku = updated.find((m) => m.id === 'claude-haiku-4-5-20251001');
assert.equal(haiku.pout, 5.5, 'accepted change applied');
assert.equal(haiku.checkedAt, TODAY, 'checkedAt of a changed model becomes today');
assert.match(haiku.note, /OpenRouter/, 'the note says the value came from OpenRouter');
assert.equal(updated.find((m) => m.id === 'gpt-5.6-luna').checkedAt, '2026-09-13', 'unchanged models keep their date');
assert.equal(PriceSync.applyUpdate(updated, { changes: [], added: [opus] }, TODAY).length, 11, 'an existing id is not added twice');
assert.deepEqual(PriceSync.diffModels(updated, orMap, TODAY).filter((r) => !r.missing).map((r) => r.id + ':' + r.field), ['deepseek-v4-pro:pin', 'deepseek-v4-pro:pout', 'deepseek-v4-pro:ctx', 'deepseek-v4-pro:maxOutput'], 'after the update only the doubtful model is left');

// ─── browser store: overridesFrom / parseStore / applyOverrides ───
const store = PriceSync.overridesFrom(null, { changes: accepted, added: [opus] }, '2026-11-06T08:00:00.000Z');
assert.equal(store.version, 1);
assert.equal(store.updatedAt, '2026-11-06T08:00:00.000Z');
assert.deepEqual(store.changes['claude-haiku-4-5-20251001'], { pout: 5.5, checkedAt: TODAY });
assert.ok(!('deepseek-v4-pro' in store.changes), 'the doubtful model is not stored');
assert.equal(store.added.length, 1);
assert.deepEqual(PriceSync.parseStore(JSON.stringify(store)), store, 'store round trip');
const merged = PriceSync.overridesFrom(store, { changes: [Object.assign({}, proIn)], added: [opus] }, '2026-11-07T08:00:00.000Z');
assert.equal(merged.changes['deepseek-v4-pro'].pin, 0.111, 'a later update merges into the store');
assert.equal(merged.changes['claude-haiku-4-5-20251001'].pout, 5.5, 'earlier changes stay');
assert.equal(merged.added.length, 1, 'added ids are not duplicated in the store');
const viaStore = PriceSync.applyOverrides(SubCore.MODELS, store);
assert.deepEqual(clone(viaStore), clone(updated), 'applyOverrides gives the same list as applyUpdate');
assert.deepEqual(clone(SubCore.MODELS), before, 'applyOverrides does not mutate the input');
const odd = clone(store);
odd.changes['no-such-model'] = { pin: 1, checkedAt: TODAY };
odd.added.push(clone(opus));
odd.added.push(Object.assign(clone(opus), { id: 'gpt-5.6-luna', name: 'Dup id' }));
const oddOut = PriceSync.applyOverrides(SubCore.MODELS, PriceSync.parseStore(JSON.stringify(odd)));
assert.equal(oddOut.length, 11, 'unknown ids ignored, added ids not duplicated');
assert.equal(oddOut.filter((m) => m.id === 'gpt-5.6-luna').length, 1);
// the same overrides apply to index's model shape and to a CSV that lacks some ids
const idxOut = PriceSync.applyOverrides(indexModels.slice(0, 9), store);
assert.equal(idxOut.length, 10, 'store applies to a shorter imported list: 9 + 1 added');
assert.equal(idxOut.find((m) => m.id === 'deepseek-flash').ctx, 1048576);
assert.ok(idxOut.find((m) => m.id === 'deepseek-flash').tier === null, 'index tier field untouched');
// corrupt / old-version stores are rejected
['', 'not json', 'null', '[]', '{"version":2,"changes":{},"added":[]}', '{"version":1,"changes":[],"added":[]}',
  '{"version":1,"updatedAt":"x","changes":{"a":{"pin":-1,"checkedAt":"2026-11-06"}},"added":[]}',
  '{"version":1,"updatedAt":"x","changes":{"a":{"pin":"1","checkedAt":"2026-11-06"}},"added":[]}',
  '{"version":1,"updatedAt":"x","changes":{},"added":[{"id":"x"}]}',
  JSON.stringify(Object.assign(clone(store), { added: [Object.assign(clone(opus), { family: 'gemini' })] })),
].forEach((text) => assert.throws(() => PriceSync.parseStore(text), Error, `rejects ${text.slice(0, 60)}`));

// ─── CSV rewrite (shared by index.html and the script) ───
const csvOut = PriceSync.updateCsvText(csv, updated);
assert.ok(csvOut.startsWith('﻿' + csv.replace(/^﻿/, '').split('\n')[0] + '\n'), 'header and BOM preserved');
const reparsed = modelsFromCsv(csvOut);
assert.equal(reparsed.length, 11);
assert.equal(reparsed.find((m) => m.id === 'claude-haiku-4-5-20251001').pout, 5.5);
assert.equal(reparsed.find((m) => m.id === 'deepseek-v4-pro').offPeak.pin, 0.66, 'off-peak kept');
assert.equal(reparsed.find((m) => m.id === 'claude-opus-5.5').note, 'Dodany z OpenRouter, sprawdź cenę u dostawcy.', 'quoted note with a comma survives');
assert.equal(reparsed.find((m) => m.id === 'claude-opus-5.5').openrouter, 'anthropic/claude-opus-5.5');
const untouched = csv.replace(/^﻿/, '').split('\n').filter((l) => /gpt-5\.6-luna/.test(l))[0];
assert.ok(csvOut.includes(untouched), 'unchanged rows are byte-identical');
assert.equal(PriceSync.updateCsvText(csv, SubCore.MODELS.map((m) => Object.assign({}, m, { note: undefined }))), csv, 'no changes -> identical text');

console.log('prices tests passed');
