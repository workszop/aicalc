const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../sub/core.js'), 'utf8'), context);
const C = vm.runInContext('globalThis.SubCore', context);
const { MODELS, SHARED_FIELDS, SEAT_FIELDS, AGENT_FIELDS, ROI_FIELDS } = C;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const noNaN = (o, p = '') => Object.entries(o).forEach(([k, v]) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && !(typeof v.name === 'string' && v.pin !== undefined)) noNaN(v, p + k + '.');
  else assert.ok(!(typeof v === 'number' && Number.isNaN(v)), 'NaN at ' + p + k);
});
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

// ─── Seats model ───
const seatBase = () => ({ ...C.defaultsOf(SHARED_FIELDS, SEAT_FIELDS, ROI_FIELDS) });
{
  const r = C.computeSeatResults(seatBase(), MODELS);
  assert.ok(near(r.sub.monthly, 1865, 0.01));
  assert.ok(near(r.sub.perUser, 93.25, 0.01));
  assert.ok(near(r.api.monthly, 835.7, 0.01));
  assert.equal(r.local.units, 1);
  assert.ok(near(r.local.monthly, 1647.33, 0.01));
  assert.equal(r.winner, 'api');
  assert.ok(near(r.breakEvenChats, 60.99, 0.01));
  assert.equal(r.model, terra);
  assert.equal(r.plan.id, 'chatgpt-business');
  noNaN(r);
  const z = C.computeSeatResults({ ...seatBase(), chatsPerDay: 0 }, MODELS);
  assert.equal(z.api.monthly, 500);
  assert.ok(Number.isFinite(z.breakEvenChats));
  noNaN(z);
  assert.equal(C.computeSeatResults({ ...seatBase(), users: 101 }, MODELS).local.units, 2);
  assert.equal(C.computeSeatResults({ ...seatBase(), model: 'missing' }, MODELS).model, MODELS[0]);
  const cu = C.computeSeatResults({ ...seatBase(), plan: 'custom', customUsd: 0 }, MODELS);
  assert.equal(cu.breakEvenChats, null);
  assert.equal(cu.plan.id, 'custom');
  assert.equal(cu.plan.usd, 0);
  noNaN(cu);
  // ineligible API is excluded from the winner choice
  const bad = C.computeSeatResults({ ...seatBase(), inTok: 2000000 }, MODELS);
  assert.equal(bad.api.eligible, false);
  assert.equal(bad.api.reason, 'ctxOver');
  assert.notEqual(bad.winner, 'api');
  noNaN(bad);
  assert.equal(C.seatPlanOf({ plan: 'nope', customUsd: 7 }).id, 'chatgpt-business');
}

// ─── Agent model ───
const agentBase = () => ({ ...C.defaultsOf(SHARED_FIELDS, AGENT_FIELDS, ROI_FIELDS) });
{
  const r = C.computeAgentResults(agentBase(), MODELS);
  assert.equal(r.model, find('Luna'));
  assert.ok(near(r.perStep, 0.0047744, 1e-7));
  assert.ok(near(r.llmPerRun, 0.03151104, 1e-7));
  assert.equal(r.toolsPerRun, 0.05);
  assert.ok(near(r.reviewPerRun, 0.595267, 1e-6));
  assert.ok(near(r.perRun, 0.676778, 1e-6));
  assert.ok(near(r.monthly, 1653.56, 0.01));
  assert.ok(near(r.manualMonthly, 35716, 0.01));
  assert.ok(near(r.savedHours, 386.67, 0.01));
  assert.equal(r.eligible, true);
  assert.equal(r.reason, null);
  noNaN(r);
  const z = C.computeAgentResults({ ...agentBase(), runs: 0 }, MODELS);
  assert.equal(z.monthly, 300);
  assert.equal(z.manualMonthly, 0);
  noNaN(z);
  const big = C.computeAgentResults({ ...agentBase(), inTok: 2000000 }, MODELS);
  assert.equal(big.eligible, false);
  assert.equal(big.reason, 'ctxOver');
  const nm = C.computeAgentResults({ ...agentBase(), manualMin: 0 }, MODELS);
  assert.equal(nm.savedHours, 0);
  noNaN(nm);
  assert.equal(C.computeAgentResults({ ...agentBase(), model: 'missing' }, MODELS).model, MODELS[0]);
}
console.log('sub-core tests passed');
