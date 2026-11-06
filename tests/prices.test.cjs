#!/usr/bin/env node
/* Pure price-update logic (sub/prices.js) against trimmed real OpenRouter snapshots: the model list
   (fixtures/openrouter-models.json) and creator endpoints (fixtures/endpoints/<id with / as __>.json).
   One value is edited on purpose: the Anthropic endpoint of Claude Haiku 4.5 has output 5.5 (real: 5),
   the "normal change" case. Everything else is the real 2026-11-06 data. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const PriceSync = require(path.join(ROOT, 'sub/prices.js'));
const SubCore = require(path.join(ROOT, 'sub/core.js'));
const feed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/openrouter-models.json'), 'utf8'));
const ENDPOINTS_DIR = path.join(__dirname, 'fixtures/endpoints');
const endpointsOf = (orId) => JSON.parse(fs.readFileSync(path.join(ENDPOINTS_DIR, PriceSync.endpointsFile(orId)), 'utf8'));
const endpointsById = new Map(fs.readdirSync(ENDPOINTS_DIR).map((f) => { const j = JSON.parse(fs.readFileSync(path.join(ENDPOINTS_DIR, f), 'utf8')); return [j.data.id, j]; }));
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
  'gemini-3.8-flash': 'google/gemini-3.8-flash',
};
const N = Object.keys(MAPPING).length; // 11 built-in models
assert.equal(SubCore.MODELS.length, N);
SubCore.MODELS.forEach((m) => assert.equal(m.openrouter, MAPPING[m.id], `core ${m.id} maps to ${MAPPING[m.id]}`));
indexModels.forEach((m) => assert.equal(m.openrouter, MAPPING[m.id], `index ${m.id} maps to ${MAPPING[m.id]}`));
Object.values(MAPPING).forEach((orId) => assert.ok(orMap.has(orId) && endpointsById.has(orId), `fixtures carry ${orId} (list and endpoints)`));
// a CSV without the openrouter_id column still loads
const header = csv.replace(/^﻿/, '').split('\n')[0].split(',');
const col = header.indexOf('openrouter_id');
assert.ok(col >= 0, 'built-in CSV has an openrouter_id column');
const legacyCsv = csv.replace(/^﻿/, '').trim().split('\n').map((line) => line.split(',').filter((_, i) => i !== col).join(',')).join('\n');
const legacy = modelsFromCsv(legacyCsv);
assert.equal(legacy.length, N, 'CSV without openrouter_id loads');
assert.ok(legacy.every((m) => m.openrouter === ''), 'missing column means no mapping');

// ─── creatorEndpoint / creatorMap ───
assert.deepEqual(PriceSync.CREATOR_TAG, { openai: 'openai', anthropic: 'anthropic', deepseek: 'deepseek', qwen: 'alibaba', google: 'google-ai-studio' });
const gemEp = endpointsOf('google/gemini-3.8-flash');
assert.ok(['google-ai-studio/flex', 'google-ai-studio/priority', 'google-vertex/global', 'google-vertex/us'].every((tag) => gemEp.data.endpoints.some((e) => e.tag === tag)), 'Gemini fixture has tag variants and Vertex');
assert.deepEqual(PriceSync.creatorEndpoint('google/gemini-3.8-flash', gemEp), { pin: 0.75, pout: 3.75, ctx: 1048576, maxOutput: 65536, provider: 'Google AI Studio', tag: 'google-ai-studio' },
  'Gemini 3.8 Flash: plain google-ai-studio, not /flex (0.375), /priority (1.35) or vertex/us (0.825, the list price)');
assert.equal(PriceSync.creatorEndpoint('google/gemini-3.8-flash', only(gemEp, ['google-ai-studio/flex', 'google-ai-studio/priority', 'google-vertex/global'])), null, 'only variants or Vertex -> null');
assert.equal(PriceSync.endpointsFile('deepseek/deepseek-v4-pro-0813'), 'deepseek__deepseek-v4-pro-0813.json');
assert.equal(PriceSync.endpointsUrl('deepseek/deepseek-v4-pro-0813'), 'https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-pro-0813/endpoints');
function only(json, tags) { const j = clone(json); j.data.endpoints = j.data.endpoints.filter((e) => tags.includes(e.tag)); return j; }
const proEp = endpointsOf('deepseek/deepseek-v4-pro-0813');
assert.ok(['wafer/us', 'alibaba', 'relace/fp4'].every((tag) => proEp.data.endpoints.some((e) => e.tag === tag)), 'the V4 Pro fixture has cheaper third-party hosts');
assert.deepEqual(PriceSync.creatorEndpoint('deepseek/deepseek-v4-pro-0813', proEp),
  { pin: 1.32, pout: 3.96, ctx: 1048576, maxOutput: 393216, provider: 'DeepSeek', tag: 'deepseek' },
  'DeepSeek V4 Pro: the deepseek endpoint, not Wafer (0.1165 / 4.66) or Alibaba (1.122 / 3.366)');
const lunaEp = endpointsOf('openai/gpt-5.6-luna');
assert.ok(lunaEp.data.endpoints.some((e) => e.tag === 'openai/flex') && lunaEp.data.endpoints.some((e) => e.tag === 'openai/fast'), 'Luna fixture has flex and fast tiers');
assert.deepEqual(PriceSync.creatorEndpoint('openai/gpt-5.6-luna', lunaEp), { pin: 0.2, pout: 1.2, ctx: 1050000, maxOutput: 128000, provider: 'OpenAI', tag: 'openai' },
  'GPT-5.6 Luna: openai, not openai/flex (0.1) or openai/fast (0.4)');
assert.equal(PriceSync.creatorEndpoint('anthropic/claude-opus-5', endpointsOf('anthropic/claude-opus-5')).pin, 5, 'anthropic, not anthropic/fast');
assert.deepEqual(PriceSync.creatorEndpoint('qwen/qwen3.7-plus', endpointsOf('qwen/qwen3.7-plus')).tag, 'alibaba', 'qwen/ is priced by Alibaba');
// edge cases: no creator endpoint, only a tag variant, wrong model, malformed, null max output, other providers
assert.equal(PriceSync.creatorEndpoint('deepseek/deepseek-v4-pro-0813', only(proEp, ['wafer/us', 'alibaba'])), null, 'no deepseek endpoint -> null, never another host');
assert.equal(PriceSync.creatorEndpoint('openai/gpt-5.6-luna', only(lunaEp, ['openai/flex', 'openai/fast'])), null, 'only tag variants -> null');
assert.equal(PriceSync.creatorEndpoint('openai/gpt-5.6-sol', lunaEp), null, 'an answer for another model is ignored');
assert.equal(PriceSync.creatorEndpoint('google/gemini-omni-1.2-flash', lunaEp), null, 'a provider without a creator tag -> null');
[null, 'x', {}, { data: [] }, { data: { endpoints: 'no' } }, { data: { endpoints: [{ tag: 'openai', pricing: { prompt: '-1', completion: '1' } }] } },
  { data: { endpoints: [{ tag: 'openai', pricing: { prompt: 'abc', completion: '1' } }] } }, { data: { endpoints: [{ tag: 'openai' }] } }]
  .forEach((bad) => assert.equal(PriceSync.creatorEndpoint('openai/gpt-x', bad), null, `malformed -> null: ${JSON.stringify(bad)}`));
const noMax = clone(lunaEp); noMax.data.endpoints.find((e) => e.tag === 'openai').max_completion_tokens = null;
assert.equal(PriceSync.creatorEndpoint('openai/gpt-5.6-luna', noMax).maxOutput, 1050000, 'null max_completion_tokens falls back to the context length');
const creators = PriceSync.creatorMap(endpointsById);
assert.ok(creators instanceof Map && creators.size === 14, 'creatorMap: every fixture has a creator endpoint');
assert.deepEqual(PriceSync.creatorMap({ 'openai/gpt-5.6-luna': lunaEp, 'openai/gpt-5.6-sol': null }), new Map([['openai/gpt-5.6-luna', PriceSync.creatorEndpoint('openai/gpt-5.6-luna', lunaEp)]]), 'creatorMap takes an object, skips null (failed fetch)');

// ─── diffModels on creator prices ───
const diff = PriceSync.diffModels(SubCore.MODELS, creators, TODAY);
const rows = diff.filter((r) => !r.missing);
assert.ok(!diff.some((r) => r.missing), 'every mapped model has a creator price');
assert.deepEqual(rows.map((r) => [r.id, r.field, r.old, r.next, r.flags]), [
  ['claude-haiku-4-5-20251001', 'pout', 5, 5.5, []],
  ['deepseek-flash', 'ctx', 1000000, 1048576, []],
  ['deepseek-flash', 'maxOutput', 384000, 393216, []],
  ['deepseek-v4-pro', 'ctx', 1000000, 1048576, []],
  ['deepseek-v4-pro', 'maxOutput', 384000, 393216, []],
], 'real creator data: only the DeepSeek ctx / max output pairs differ (plus the edited Haiku output), nothing big');
const row = (id, field) => rows.find((r) => r.id === id && r.field === field);
assert.equal(row('deepseek-v4-pro', 'ctx').openrouter, 'deepseek/deepseek-v4-pro-0813');
assert.equal(row('deepseek-v4-pro', 'ctx').name, 'DeepSeek V4 Pro 0813');
assert.ok(Math.abs(row('deepseek-v4-pro', 'ctx').pctChange - 4.8576) < 1e-4, `pctChange ${row('deepseek-v4-pro', 'ctx').pctChange}`);
// safety net: a real >30% creator price change is still flagged, and the whole model with it
const proUp = clone(proEp); proUp.data.endpoints.find((e) => e.tag === 'deepseek').pricing.prompt = '0.0000001165';
const bigDiff = PriceSync.diffModels(SubCore.MODELS, PriceSync.creatorMap(Object.assign(Object.fromEntries(endpointsById), { 'deepseek/deepseek-v4-pro-0813': proUp })), TODAY);
const proIn = bigDiff.find((r) => r.id === 'deepseek-v4-pro' && r.field === 'pin');
assert.deepEqual([proIn.old, proIn.next], [1.32, 0.1165]);
assert.ok(Math.abs(proIn.pctChange - (-91.174242)) < 1e-4, `pctChange ${proIn.pctChange}`);
assert.ok(proIn.flags.includes('big'), 'a big creator price change is flagged');
assert.ok(['ctx', 'maxOutput'].every((f) => bigDiff.find((r) => r.id === 'deepseek-v4-pro' && r.field === f).flags.includes('big')), 'the other changes of that model are flagged too');
assert.deepEqual(bigDiff.find((r) => r.id === 'deepseek-flash' && r.field === 'ctx').flags, [], 'other models are not affected');
// a big context or max-output change alone is flagged big (not only prices)
const ctxBig = clone(SubCore.MODELS); const luna = ctxBig.find((m) => m.id === 'gpt-5.6-luna'); luna.ctx = 400000;
const ctxBigRow = PriceSync.diffModels(ctxBig, creators, TODAY).find((r) => r.id === 'gpt-5.6-luna' && r.field === 'ctx');
assert.deepEqual(ctxBigRow.flags, ['big'], 'context 400000 -> 1050000 is flagged big');
// a relative difference below 1e-9 does not count
const nearly = clone(SubCore.MODELS);
nearly[0].pin = 0.2 * (1 + 1e-12);
assert.ok(!PriceSync.diffModels(nearly, creators, TODAY).some((r) => r.id === 'gpt-5.6-luna'), 'float noise is not a change');
// tier model price change flags tiersKept (index shape with tier object and core shape with tierAbove)
const tierCore = clone(SubCore.MODELS); tierCore[0].pin = 0.25;
const tierRow = PriceSync.diffModels(tierCore, creators, TODAY).find((r) => r.id === 'gpt-5.6-luna' && r.field === 'pin');
assert.deepEqual(tierRow.flags, ['tiersKept'], 'core: tier model price change -> tiersKept (20% is not big)');
const tierIdx = clone(indexModels); tierIdx[0].pout = 0.6;
const tierIdxRow = PriceSync.diffModels(tierIdx, creators, TODAY).find((r) => r.id === 'gpt-5.6-luna' && r.field === 'pout');
assert.deepEqual(tierIdxRow.flags.sort(), ['big', 'tiersKept'], 'index: tier model +100% -> big and tiersKept');
const unmapped = clone(SubCore.MODELS); unmapped.forEach((m) => { m.openrouter = ''; });
assert.deepEqual(PriceSync.diffModels(unmapped, creators, TODAY), [], 'models without a mapping are not diffed');

// ─── discovery / creatorIds ───
const fetchIds = PriceSync.creatorIds(SubCore.MODELS, feed, 15);
assert.deepEqual(fetchIds.slice(0, N), Object.values(MAPPING), 'mapped models first');
const discovered = fetchIds.slice(N);
assert.deepEqual(discovered, ['openai/gpt-6.1-terra', 'anthropic/claude-haiku-5.5', 'openai/gpt-6.1-sol', 'anthropic/claude-sonnet-5.5', 'openai/gpt-6-luna',
  'anthropic/claude-opus-5.5'], 'discovered candidates, newest first, one per line (GPT-6 Sol and the older DeepSeek V4 Flash drop out)');
// filters, each on the real list plus synthetic entries
const entry = (id, created) => ({ id, name: id, created, context_length: 1000, pricing: { prompt: '0.000001', completion: '0.000002' }, top_provider: { max_completion_tokens: null } });
const extra = clone(feed);
['openai/gpt-7-astra', 'openai/gpt-7-solo', 'openai/o9-mini', 'openai/gpt-7-terra', 'openai/gpt-7.1-luna-mini', 'openai/gpt-7-preview',
  'deepseek/deepseek-v5-experimental', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4.1-flash-2', 'qwen/qwen9',
  'google/gemini-9-flash', 'google/gemini-9.1-flash-lite', 'google/gemini-9-pro', 'google/gemma-9-flash'].forEach((id, i) => extra.data.push(entry(id, 1999999999 - i)));
const extraIds = PriceSync.creatorIds(SubCore.MODELS, extra, 50).slice(N);
const has_ = (id) => extraIds.includes(id);
assert.ok(has_('openai/gpt-7-terra') && has_('openai/gpt-7.1-luna-mini'), 'OpenAI: luna / terra / sol tiers are candidates');
['openai/gpt-7-astra', 'openai/gpt-7-solo', 'openai/o9-mini'].forEach((id) => assert.ok(!has_(id), `OpenAI: ${id} is not a luna / terra / sol tier`));
assert.ok(!has_('openai/gpt-oss-safeguard-20b') && !has_('openai/gpt-5.4-image-2') && !has_('openai/gpt-6.1-terra-pro') && !has_('openai/gpt-7-preview'), 'OpenAI: guard, image, -pro, preview skipped');
['deepseek/deepseek-v4-flash-vision-exp', 'deepseek/deepseek-v3.2-exp', 'deepseek/deepseek-v5-experimental'].forEach((id) => assert.ok(!has_(id), `DeepSeek: experimental ${id} skipped`));
assert.ok(!has_('deepseek/deepseek-v4.1-flash'), 'DeepSeek: near-duplicate of mapped deepseek-v4.1-flash-1017 skipped');
assert.ok(has_('deepseek/deepseek-v4.1-flash-2'), 'only an exact match after stripping the mapped id\'s date suffix is a near-duplicate');
assert.ok(!has_('deepseek/deepseek-v4-pro'), 'DeepSeek: -pro still skipped by the general pattern');
assert.ok(!extraIds.some((id) => id.startsWith('qwen/')), 'no qwen candidates');
assert.ok(has_('google/gemini-9-flash'), 'Google: gemini-<version>-flash is a candidate');
assert.ok(!has_('google/gemini-3.8-flash'), 'Google: only the newest Flash is a candidate, an older one is dropped');
assert.equal(extraIds.filter((id) => id.startsWith('google/')).length, 1, 'exactly one Google candidate');
['google/gemini-3.5-flash-lite', 'google/gemini-3.1-flash-image', 'google/gemini-omni-1.2-flash', 'google/gemini-9.1-flash-lite', 'google/gemini-9-pro', 'google/gemma-9-flash']
  .forEach((id) => assert.ok(!has_(id), `Google: ${id} skipped`));
assert.ok(extraIds.every((id) => !id.endsWith(':batch') && !id.startsWith('~')), 'no batch or alias');
// one candidate per line, never an older version of a line already on the list
assert.equal(PriceSync.lineOf('openai', 'gpt-6.1-sol'), 'openai:sol');
assert.equal(PriceSync.lineOf('anthropic', 'claude-opus-5.5'), 'anthropic:claude-opus');
assert.equal(PriceSync.lineOf('anthropic', 'claude-haiku-4-5-20251001'), 'anthropic:claude-haiku-4');
assert.equal(PriceSync.familyOf('anthropic', 'claude-opus-4.6'), 'claude', 'Claude before 4.7 uses the older tokenizer');
assert.equal(PriceSync.familyOf('anthropic', 'claude-opus-4.7'), 'claudeNew');
assert.equal(PriceSync.familyOf('anthropic', 'claude-haiku-5.5'), 'claudeNew');
const lines = clone(feed);
[['openai/gpt-8-sol', 1999999990], ['openai/gpt-8.1-sol', 1999999995], ['anthropic/claude-opus-4.9', 1000], ['anthropic/claude-fable-5', 1001]].forEach(([id, c]) => lines.data.push(entry(id, c)));
const lineIds = PriceSync.creatorIds(SubCore.MODELS, lines, 50).slice(N);
assert.ok(lineIds.includes('openai/gpt-8.1-sol') && !lineIds.includes('openai/gpt-8-sol') && !lineIds.includes('openai/gpt-6.1-sol'), 'only the newest Sol is a candidate');
assert.ok(!lineIds.includes('anthropic/claude-opus-4.9') && !lineIds.includes('anthropic/claude-fable-5'), 'an older version of a mapped line (Opus 5, Fable 5.1) is not a candidate');
assert.equal(PriceSync.creatorIds(SubCore.MODELS, extra, 3).length, N + 3, 'limit is honoured: mapped + 3');
const goneMapped = clone(SubCore.MODELS); goneMapped[1].openrouter = 'openai/gpt-gone';
assert.ok(!PriceSync.creatorIds(goneMapped, feed, 15).includes('openai/gpt-gone'), 'a mapped id missing from the list is not fetched');

// ─── newModelCandidates: priced by the creator endpoint ───
const cands = PriceSync.newModelCandidates(SubCore.MODELS, feed, creators, 15, TODAY);
assert.deepEqual(cands.map((c) => c.openrouter), ['openai/gpt-6.1-terra', 'anthropic/claude-haiku-5.5'], 'candidates without a creator endpoint are dropped');
const haiku55 = cands.find((c) => c.openrouter === 'anthropic/claude-haiku-5.5');
assert.deepEqual(
  { id: haiku55.id, name: haiku55.name, family: haiku55.family, cls: haiku55.cls, alwaysThinks: haiku55.alwaysThinks, pin: haiku55.pin, pout: haiku55.pout, ctx: haiku55.ctx, maxOutput: haiku55.maxOutput, checkedAt: haiku55.checkedAt, source: haiku55.source, note: haiku55.note, tier: haiku55.tier, offPeak: haiku55.offPeak, tierAbove: haiku55.tierAbove, canAdd: haiku55.canAdd },
  { id: 'claude-haiku-5.5', name: 'Anthropic Claude Haiku 5.5', family: 'claudeNew', cls: 'standard', alwaysThinks: false, pin: 0.1, pout: 0.5, ctx: 1000000, maxOutput: 128000, checkedAt: TODAY, source: 'https://openrouter.ai/anthropic/claude-haiku-5.5/providers', note: 'Cena twórcy modelu (z OpenRouter).', tier: null, offPeak: null, tierAbove: null, canAdd: true },
  'candidate fields: prices from the anthropic endpoint (0.1 / 0.5)');
// Gemini is a built-in model with a measured tokenizer factor (2026-11-06), so a newer Gemini Flash can be added
assert.ok(PriceSync.KNOWN_FAMILIES.includes('gemini') && SubCore.TOK_PER_WORD.gemini.pl === 2.24 && SubCore.TOK_PER_WORD.gemini.en === 1.46, 'gemini family with measured factors');
const gem9 = Object.assign(clone(haiku55), { id: 'gemini-9-flash', name: 'Google Gemini 9 Flash', openrouter: 'google/gemini-9-flash', family: 'gemini' });
assert.equal(PriceSync.applyUpdate(SubCore.MODELS, { changes: [], added: [gem9] }, TODAY).length, N + 1, 'a Gemini candidate can be added');
// a family without a tokenizer factor is never added or stored
const mystery = Object.assign(clone(haiku55), { id: 'mystery-1', name: 'Mystery 1', family: 'mystery', canAdd: false });
assert.equal(PriceSync.applyUpdate(SubCore.MODELS, { changes: [], added: [mystery] }, TODAY).length, N, 'an unknown family is never added by applyUpdate');
assert.equal(PriceSync.overridesFrom(null, { changes: [], added: [mystery] }).added.length, 0, 'nor stored');
assert.throws(() => PriceSync.parseStore(JSON.stringify(Object.assign(PriceSync.overridesFrom(null, {}), { added: [mystery] }))), /family/, 'a stored unknown-family model is rejected');
const lowHost = clone(endpointsOf('anthropic/claude-haiku-5.5'));
lowHost.data.endpoints.unshift({ provider_name: 'Cheap', tag: 'cheap/fp4', pricing: { prompt: '0.00000001', completion: '0.00000002' }, context_length: 2000000, max_completion_tokens: 1, quantization: 'fp4' });
assert.equal(PriceSync.newModelCandidates(SubCore.MODELS, feed, PriceSync.creatorMap({ 'anthropic/claude-haiku-5.5': lowHost }), 15, TODAY)[0].pin, 0.1, 'a cheaper host listed first is ignored');
assert.equal(cands[0].name, 'OpenAI GPT-6.1 Terra');
assert.equal(cands[0].family, 'openai');
assert.deepEqual([cands[0].pin, cands[0].pout], [1, 5], 'GPT-6.1 Terra: openai, not openai/flex');
assert.equal(PriceSync.newModelCandidates(SubCore.MODELS, feed, creators, 1, TODAY).length, 1, 'limit is honoured');
assert.deepEqual(PriceSync.newModelCandidates(SubCore.MODELS, feed, new Map(), 15, TODAY), [], 'no creator data, no candidates');
// naming rules, with a stand-in creator price for every discovered id
const fake = { pin: 1, pout: 2, ctx: 1000, maxOutput: 1000, provider: 'X', tag: 'x' };
const named = PriceSync.newModelCandidates(SubCore.MODELS, feed, new Map(discovered.map((id) => [id, fake])), 15, TODAY);
assert.equal(named.length, discovered.length);
assert.ok(named.every((c, i) => i === 0 || named[i - 1].created >= c.created), 'newest first');
assert.equal(named.find((c) => c.openrouter === 'anthropic/claude-opus-5.5').name, 'Anthropic Claude Opus 5.5', 'no doubled provider word');
const clash = clone(SubCore.MODELS); clash.push(Object.assign(clone(clash[0]), { id: 'x', name: 'OpenAI GPT-6 Luna', openrouter: '' }));
assert.equal(PriceSync.newModelCandidates(clash, feed, new Map(discovered.map((id) => [id, fake])), 15, TODAY).find((c) => c.openrouter === 'openai/gpt-6-luna').name, 'OpenAI GPT-6 Luna (OpenRouter)', 'a name that clashes with a model on the list gets a suffix');
const noCtx = new Map([['anthropic/claude-haiku-5.5', Object.assign({}, fake, { ctx: null })]]);
assert.deepEqual(PriceSync.newModelCandidates(SubCore.MODELS, feed, noCtx, 15, TODAY), [], 'a creator endpoint without a context length is dropped');

// ─── creatorUpdate: missing vs no creator price ───
const data = { list: feed, listMap: orMap, endpoints: endpointsById };
const upd = PriceSync.creatorUpdate(SubCore.MODELS, data, 15, TODAY);
assert.equal(upd.rows.length, 5);
assert.deepEqual([upd.missing, upd.noCreator], [[], []]);
assert.equal(upd.candidates.length, 2);
const broken = clone(SubCore.MODELS); broken[1].openrouter = 'openai/gpt-gone';
const eps = new Map(endpointsById);
eps.set('deepseek/deepseek-v4-pro-0813', only(proEp, ['wafer/us', 'alibaba', 'relace/fp4']));
eps.set('anthropic/claude-sonnet-5', null);
const upd2 = PriceSync.creatorUpdate(broken, { list: feed, listMap: orMap, endpoints: eps }, 15, TODAY);
assert.deepEqual(upd2.missing, [{ id: 'gpt-5.6-terra', name: 'OpenAI GPT-5.6 Terra', openrouter: 'openai/gpt-gone', missing: true }], 'a mapped id absent from the list is missing');
assert.deepEqual(upd2.noCreator.map((r) => r.id), ['claude-sonnet-5', 'deepseek-v4-pro'], 'no creator endpoint, or a failed request: the no-creator bucket');
assert.ok(upd2.noCreator.every((r) => r.noCreator && !r.missing), 'no-creator rows are not "missing"');
assert.ok(!upd2.rows.some((r) => r.id === 'deepseek-v4-pro'), 'no fallback to another host');
assert.deepEqual(upd2.rows.map((r) => r.id + ':' + r.field), ['claude-haiku-4-5-20251001:pout', 'deepseek-flash:ctx', 'deepseek-flash:maxOutput'], 'the rest still works');

// ─── applyUpdate ───
const before = clone(SubCore.MODELS);
const accepted = rows.filter((r) => !r.flags.includes('big'));
const updated = PriceSync.applyUpdate(SubCore.MODELS, { changes: accepted, added: [haiku55] }, TODAY);
assert.deepEqual(clone(SubCore.MODELS), before, 'applyUpdate does not mutate the input');
assert.notEqual(updated, SubCore.MODELS);
assert.equal(updated.length, N + 1, 'added model appended');
assert.equal(updated[N].id, 'claude-haiku-5.5');
const pro = updated.find((m) => m.id === 'deepseek-v4-pro');
assert.deepEqual([pro.pin, pro.pout, pro.ctx, pro.maxOutput], [1.32, 3.96, 1048576, 393216], 'DeepSeek V4 Pro keeps its prices, takes the context and max output');
const haiku = updated.find((m) => m.id === 'claude-haiku-4-5-20251001');
assert.equal(haiku.pout, 5.5, 'accepted change applied');
assert.equal(haiku.checkedAt, TODAY, 'checkedAt of a changed model becomes today');
assert.equal(haiku.note, 'Cena twórcy modelu (z OpenRouter).', 'the note says it is the creator price via OpenRouter');
assert.equal(updated.find((m) => m.id === 'gpt-5.6-luna').checkedAt, '2026-09-13', 'unchanged models keep their date');
assert.equal(PriceSync.applyUpdate(updated, { changes: [], added: [haiku55] }, TODAY).length, N + 1, 'an existing id is not added twice');
assert.deepEqual(PriceSync.diffModels(updated, creators, TODAY), [], 'after the update nothing is left');
const notBig = PriceSync.applyUpdate(SubCore.MODELS, { changes: bigDiff.filter((r) => !r.flags.includes('big')) }, TODAY).find((m) => m.id === 'deepseek-v4-pro');
assert.deepEqual([notBig.pin, notBig.ctx], [1.32, 1000000], 'a doubtful model keeps its built-in values when only non-big rows are accepted');

// ─── browser store: overridesFrom / parseStore / applyOverrides ───
const store = PriceSync.overridesFrom(null, { changes: accepted, added: [haiku55] }, '2026-11-06T08:00:00.000Z');
assert.equal(store.version, 1);
assert.equal(store.updatedAt, '2026-11-06T08:00:00.000Z');
assert.deepEqual(store.changes['claude-haiku-4-5-20251001'], { pout: 5.5, checkedAt: TODAY });
assert.deepEqual(store.changes['deepseek-v4-pro'], { ctx: 1048576, maxOutput: 393216, checkedAt: TODAY });
assert.equal(store.added.length, 1);
assert.deepEqual(PriceSync.parseStore(JSON.stringify(store)), store, 'store round trip');
const merged = PriceSync.overridesFrom(store, { changes: [Object.assign({}, proIn)], added: [haiku55] }, '2026-11-07T08:00:00.000Z');
assert.equal(merged.changes['deepseek-v4-pro'].pin, 0.1165, 'a later update merges into the store');
assert.equal(merged.changes['deepseek-v4-pro'].ctx, 1048576, 'earlier fields of the same model stay');
assert.equal(merged.changes['claude-haiku-4-5-20251001'].pout, 5.5, 'earlier changes stay');
assert.equal(merged.added.length, 1, 'added ids are not duplicated in the store');
const viaStore = PriceSync.applyOverrides(SubCore.MODELS, store);
assert.deepEqual(clone(viaStore), clone(updated), 'applyOverrides gives the same list as applyUpdate');
assert.deepEqual(clone(SubCore.MODELS), before, 'applyOverrides does not mutate the input');
assert.deepEqual(clone(PriceSync.applyOverrides(SubCore.MODELS, null)), before, 'no store: the built-in numbers, unchanged');
const odd = clone(store);
odd.changes['no-such-model'] = { pin: 1, checkedAt: TODAY };
odd.added.push(clone(haiku55));
odd.added.push(Object.assign(clone(haiku55), { id: 'gpt-5.6-luna', name: 'Dup id' }));
const oddOut = PriceSync.applyOverrides(SubCore.MODELS, PriceSync.parseStore(JSON.stringify(odd)));
assert.equal(oddOut.length, N + 1, 'unknown ids ignored, added ids not duplicated');
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
  JSON.stringify(Object.assign(clone(store), { added: [Object.assign(clone(haiku55), { family: 'mystery' })] })),
].forEach((text) => assert.throws(() => PriceSync.parseStore(text), Error, `rejects ${text.slice(0, 60)}`));

// ─── CSV rewrite (shared by index.html and the script) ───
const commaNote = Object.assign(clone(haiku55), { id: 'comma-note', name: 'Comma note', note: 'Dodany z OpenRouter, sprawdź cenę u dostawcy.' });
const csvOut = PriceSync.updateCsvText(csv, updated.concat([commaNote]));
assert.ok(csvOut.startsWith('﻿' + csv.replace(/^﻿/, '').split('\n')[0] + '\n'), 'header and BOM preserved');
const reparsed = modelsFromCsv(csvOut);
assert.equal(reparsed.length, N + 2);
assert.equal(reparsed.find((m) => m.id === 'claude-haiku-4-5-20251001').pout, 5.5);
assert.equal(reparsed.find((m) => m.id === 'claude-haiku-4-5-20251001').note, 'Cena twórcy modelu (z OpenRouter).');
assert.equal(reparsed.find((m) => m.id === 'deepseek-v4-pro').offPeak.pin, 0.66, 'off-peak kept');
assert.equal(reparsed.find((m) => m.id === 'deepseek-v4-pro').maxOutput, 393216);
assert.equal(reparsed.find((m) => m.id === 'comma-note').note, 'Dodany z OpenRouter, sprawdź cenę u dostawcy.', 'quoted note with a comma survives');
assert.equal(reparsed.find((m) => m.id === 'claude-haiku-5.5').openrouter, 'anthropic/claude-haiku-5.5');
assert.equal(reparsed.find((m) => m.id === 'claude-haiku-5.5').source, 'https://openrouter.ai/anthropic/claude-haiku-5.5/providers');
const untouched = csv.replace(/^﻿/, '').split('\n').filter((l) => /gpt-5\.6-luna/.test(l))[0];
assert.ok(csvOut.includes(untouched), 'unchanged rows are byte-identical');
assert.equal(PriceSync.updateCsvText(csv, SubCore.MODELS.map((m) => Object.assign({}, m, { note: undefined }))), csv, 'no changes -> identical text');

// ─── fetchCreatorData (I/O injected) ───
async function fetchTests() {
  let inFlight = 0;
  let peak = 0;
  const progress = [];
  const asked = [];
  const io = {
    list: async () => clone(feed),
    endpoints: async (id) => {
      asked.push(id);
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      if (id === 'anthropic/claude-sonnet-5') throw new Error('timeout');
      if (!endpointsById.has(id)) throw new Error('HTTP 404');
      return clone(endpointsById.get(id));
    },
  };
  const got = await PriceSync.fetchCreatorData(SubCore.MODELS, io, { onProgress: (d, n) => progress.push(d + '/' + n) });
  assert.equal(got.ids.length, N + 6, 'mapped + 6 candidates');
  assert.deepEqual(asked.slice().sort(), got.ids.slice().sort(), 'each id is asked once');
  assert.ok(peak <= 4 && peak > 1, `at most 4 requests in flight (peak ${peak})`);
  assert.equal(progress[0], '0/17');
  assert.equal(progress[progress.length - 1], '17/17');
  assert.equal(progress.length, 18, 'progress after every request');
  assert.equal(got.endpoints.get('anthropic/claude-sonnet-5'), null, 'a failed request is kept as null');
  const u = PriceSync.creatorUpdate(SubCore.MODELS, got, 15, TODAY);
  assert.deepEqual(u.noCreator.map((r) => r.id), ['claude-sonnet-5'], 'partial failure: that model has no creator price');
  assert.equal(u.rows.length, 5, 'the rest still works');
  assert.deepEqual(u.candidates.map((c) => c.openrouter), ['openai/gpt-6.1-terra', 'anthropic/claude-haiku-5.5']);
  await assert.rejects(PriceSync.fetchCreatorData(SubCore.MODELS, { list: async () => { throw new Error('offline'); }, endpoints: io.endpoints }), /offline/, 'the list failing is a total failure');
  await assert.rejects(PriceSync.fetchCreatorData(SubCore.MODELS, { list: async () => ({ nope: 1 }), endpoints: io.endpoints }), /OpenRouter/, 'a malformed list is a total failure');
  const one = await PriceSync.fetchCreatorData(SubCore.MODELS, io, { concurrency: 1 });
  assert.equal(one.endpoints.size, 17, 'concurrency 1 still fetches everything');
}

fetchTests().then(() => console.log('prices tests passed'), (error) => { console.error(error); process.exit(1); });
