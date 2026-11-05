const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../sub/core.js'), 'utf8'), context);
const C = vm.runInContext('globalThis.SubCore', context);
const { MODELS, SHARED_FIELDS, SEAT_FIELDS, AGENT_FIELDS } = C;
const find = (name) => MODELS.find((m) => m.name.includes(name));

assert.equal(C.validateValue(SEAT_FIELDS.chatsPerDay, 1001).error, 'range');
assert.equal(C.validateValue(AGENT_FIELDS.steps, 1.5).error, 'integer');
assert.equal(C.validateValue(SHARED_FIELDS.fx, 'x').error, 'number');
assert.equal(C.validateValue(SHARED_FIELDS.fx, 3.73).error, null);

const schemas = [SHARED_FIELDS, SEAT_FIELDS];
const st = C.loadState(schemas, { users: 5, model: 'gone', plan: 'nope' }, MODELS);
assert.equal(st.users, 5);
assert.equal(st.model, SEAT_FIELDS.model.def);
assert.equal(st.plan, 'chatgpt-business');
assert.deepEqual({ ...C.loadState(schemas, 'garbage', MODELS) }, { ...C.defaultsOf(...schemas) });
assert.equal(C.loadState(schemas, { model: 'DeepSeek V4.1 Flash' }, MODELS).model, 'DeepSeek V4.1 Flash');
assert.ok(MODELS.some((m) => m.name === SEAT_FIELDS.model.def) && MODELS.some((m) => m.name === AGENT_FIELDS.model.def), 'default models exist');

assert.equal(C.familyFactor('openai', 'pl'), 1);
const terra = find('Terra');
const s = { docLang: 'pl', fx: 3.73 };
assert.ok(Math.abs(C.chatCost(terra, s, 3000, 700).perCall - 0.053712) < 1e-9);
assert.equal(C.chatCost(terra, s, 2000000, 0).reason, 'ctxOver');
assert.equal(C.chatCost(terra, s, 2000000, 0).eligible, false);
assert.equal(C.chatCost(terra, s, 1000, 200000).reason, 'outputOver');
assert.equal(C.chatCost(terra, s, 1000, 100).reason, null);
const fable = find('Fable');
assert.equal(C.chatCost(fable, s, 1000, 100).outTok, 3 * 100 * C.familyFactor('claudeNew', 'pl'));
// long-context tier
assert.equal(C.modelRates(terra, 300000).tiered, true);
assert.equal(C.modelRates(terra, 300000).pin, 4);
assert.equal(C.modelRates(terra, 1000).pin, 2);
assert.equal(C.modelRates(find('Opus'), 900000).tiered, false);
console.log('sub-core tests passed');
