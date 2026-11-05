const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const context = vm.createContext({ console, URLSearchParams });
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

// ─── Seats break-even kinds and winner ───
{
  // defaults: seats beat the API from ~61 chats per person per day
  const def = C.computeSeatResults(seatBase(), MODELS);
  assert.equal(def.breakEven.kind, 'from');
  assert.ok(near(def.breakEven.value, 60.99, 0.01));
  assert.equal(def.breakEven.value, def.breakEvenChats);
  // 3 users: the chat upkeep per person exceeds the seat price, so seats win at any usage
  const three = C.computeSeatResults({ ...seatBase(), users: 3 }, MODELS);
  assert.equal(three.winner, 'sub');
  assert.equal(three.breakEven.kind, 'always');
  assert.equal(three.breakEven.value, null);
  assert.equal(three.breakEvenChats, null);
  // free chats: the API costs only uiOps, seats never undercut it
  const free = C.computeSeatResults({ ...seatBase(), inTok: 0, outTok: 0 }, MODELS);
  assert.equal(free.breakEven.kind, 'never');
  assert.equal(free.breakEven.value, null);
  assert.equal(free.breakEvenChats, null);
  // a custom price of 0 is cheaper than the API at any usage
  assert.equal(C.computeSeatResults({ ...seatBase(), plan: 'custom', customUsd: 0 }, MODELS).breakEven.kind, 'always');
  // heavy use: the local box wins
  const heavy = C.computeSeatResults({ ...seatBase(), users: 20, chatsPerDay: 100 }, MODELS);
  assert.equal(heavy.winner, 'local');
  assert.ok(heavy.local.monthly < heavy.sub.monthly && heavy.local.monthly < heavy.api.monthly);
  // ties break in the order sub, api, local
  const zeroCost = { ...seatBase(), plan: 'custom', customUsd: 0, chatsPerDay: 0, uiOps: 0, localCapex: 0, localPower: 0, localOps: 0 };
  const allTie = C.computeSeatResults(zeroCost, MODELS);
  assert.equal(allTie.sub.monthly, 0); assert.equal(allTie.api.monthly, 0); assert.equal(allTie.local.monthly, 0);
  assert.equal(allTie.winner, 'sub');
  const apiLocalTie = C.computeSeatResults({ ...zeroCost, customUsd: 1 }, MODELS);
  assert.equal(apiLocalTie.api.monthly, 0); assert.equal(apiLocalTie.local.monthly, 0);
  assert.equal(apiLocalTie.winner, 'api');
  // with the API ineligible, a sub/local tie still goes to sub
  assert.equal(C.computeSeatResults({ ...zeroCost, inTok: 2000000 }, MODELS).winner, 'sub');
}

// ─── Agent model ───
const agentBase = () => ({ ...C.defaultsOf(SHARED_FIELDS, AGENT_FIELDS, ROI_FIELDS) });
{
  const r = C.computeAgentResults(agentBase(), MODELS);
  assert.equal(r.model, find('Luna'));
  assert.ok(near(r.perStep, 0.0047744, 1e-7));
  assert.ok(near(r.llmPerRun, 0.03151104, 1e-7));
  assert.equal(r.toolsPerRun, 0.05);
  assert.ok(near(r.perRun, 0.08151104, 1e-7), 'perRun = LLM + tools');
  assert.equal(r.perRun, r.llmPerRun + r.toolsPerRun);
  assert.ok(near(r.monthly, 463.02, 0.01), 'monthly = runs x perRun + platform');
  assert.equal(r.monthly, 2000 * r.perRun + 300);
  assert.deepEqual(Object.keys(r), ['model', 'perStep', 'llmPerRun', 'toolsPerRun', 'perRun', 'monthly', 'eligible', 'reason'], 'no labour-cost results');
  assert.equal(r.eligible, true);
  assert.equal(r.reason, null);
  noNaN(r);
  const z = C.computeAgentResults({ ...agentBase(), runs: 0 }, MODELS);
  assert.equal(z.monthly, 300);
  noNaN(z);
  const big = C.computeAgentResults({ ...agentBase(), inTok: 2000000 }, MODELS);
  assert.equal(big.eligible, false);
  assert.equal(big.reason, 'ctxOver');
  // the removed hourly rate, review and manual-time inputs no longer change anything
  const legacy = C.computeAgentResults({ ...agentBase(), hourlyRate: 500, reviewPct: 100, reviewMin: 60, manualMin: 600 }, MODELS);
  assert.equal(legacy.monthly, r.monthly);
  assert.equal(legacy.perRun, r.perRun);
  assert.equal(C.computeAgentResults({ ...agentBase(), model: 'missing' }, MODELS).model, MODELS[0]);
}

// ─── ROI model ───
{
  const ser = C.roiSeries(1000, 5000, 25000, 3, 12);
  assert.equal(ser.length, 13);
  assert.equal(ser[0], -25000);
  assert.ok(near(ser[1], -24333.33, 0.01));
  assert.ok(near(ser[2], -22000, 0.01));
  assert.ok(near(ser[7], -2000, 0.01));
  assert.ok(near(ser[8], 2000, 0.01));
  const r = C.computeRoi({ costMonthly: 1000, benefitMonthly: 5000, oneOff: 25000, ramp: 3, horizon: 12 });
  assert.ok(near(r.sumBenefit, 55000, 1e-6), 'sumBenefit');
  assert.ok(near(r.sumCost, 12000, 1e-9), 'sumCost excludes oneOff');
  assert.equal(r.horizon, 12);
  assert.equal(r.paybackMonth, 8);
  assert.ok(near(r.roiPct, 48.65, 0.01));
  assert.ok(near(r.netMonthly, 4000, 1e-9));
  assert.equal(r.series.length, 13);
  assert.ok(near(C.roiSeries(1000, 5000, 25000, 0, 12)[1], -25000 + 4000, 1e-9));
  const nb = C.computeRoi({ costMonthly: 1000, benefitMonthly: 0, oneOff: 25000, ramp: 3, horizon: 12 });
  assert.equal(nb.paybackMonth, null);
  assert.ok(near(nb.roiPct, -100, 1e-9));
  const zero = C.computeRoi({ costMonthly: 0, benefitMonthly: 0, oneOff: 0, ramp: 0, horizon: 12 });
  assert.equal(zero.roiPct, null);
  assert.equal(zero.sumBenefit, 0);
  assert.equal(zero.sumCost, 0);
  assert.equal(zero.paybackMonth, null);
  assert.ok(zero.series.every((v) => Number.isFinite(v)));
  noNaN(zero);
  assert.equal(C.timeBenefit, undefined, 'timeBenefit is removed');
  const ag = C.computeRoi({ costMonthly: 463.02, benefitMonthly: ROI_FIELDS.benefitMonthly.def, oneOff: 25000, ramp: 3, horizon: 36 });
  assert.equal(ag.paybackMonth, 7);
  assert.deepEqual({ ...C.parseRoiQuery('?cost=abc&users=0') }, {});
  assert.deepEqual({ ...C.parseRoiQuery('?cost=1200&oneOff=30000&users=50') }, { costMonthly: 1200, setup: 30000, training: 0, users: 50 });
  assert.deepEqual({ ...C.parseRoiQuery('?cost=-5') }, {});
  assert.deepEqual({ ...C.parseRoiQuery('?cost=&users=1.5') }, {});
  assert.deepEqual({ ...C.parseRoiQuery('') }, {});
}

// ─── ROI fields: the benefit is an entered monthly amount ───
{
  const P = C.ROI_PAGE_FIELDS;
  assert.deepEqual(Object.keys(P), ['costMonthly']);
  assert.deepEqual(Object.keys(ROI_FIELDS), ['roiOn', 'benefitMonthly', 'ramp', 'setup', 'training']);
  const B = ROI_FIELDS.benefitMonthly;
  assert.equal(B.def, 5000);
  assert.equal(B.min, 0);
  assert.equal(B.max, 1e8);
  assert.ok(!B.integer, 'benefitMonthly accepts fractions');
  assert.equal(C.validateValue(B, 1234.5).error, null);
  assert.equal(C.validateValue(B, -1).error, 'range');
  assert.equal(C.validateValue(B, 1e8 + 1).error, 'range');
  const roiSchemas = [SHARED_FIELDS, ROI_FIELDS, P];
  const restored = C.loadState(roiSchemas, { benefitMode: 'cash', benefitMonthly: 'x', costMonthly: 900 }, MODELS);
  assert.equal(restored.benefitMonthly, 5000);
  assert.equal(restored.costMonthly, 900);
  // every page with ROI carries benefitMonthly
  [[SHARED_FIELDS, SEAT_FIELDS, ROI_FIELDS], [SHARED_FIELDS, AGENT_FIELDS, ROI_FIELDS], roiSchemas]
    .forEach((schemas) => assert.equal(C.defaultsOf(...schemas).benefitMonthly, 5000));
}

// ─── Removed labour-cost fields ───
{
  const gone = ['hourlyRate', 'reviewPct', 'reviewMin', 'manualMin', 'minPerDay', 'adoption', 'benefitMode'];
  const all = [SHARED_FIELDS, SEAT_FIELDS, AGENT_FIELDS, ROI_FIELDS, C.ROI_PAGE_FIELDS];
  gone.forEach((id) => all.forEach((schema) => assert.ok(!Object.prototype.hasOwnProperty.call(schema, id), id + ' is removed from every schema')));
  // An old save with the removed keys still loads: known keys are kept, removed ones are dropped.
  const old = { hourlyRate: 120, reviewPct: 50, reviewMin: 5, manualMin: 30, minPerDay: 40, adoption: 80, benefitMode: 'time', runs: 500, benefitMonthly: 7000, horizon: 24 };
  const agentSchemas = [SHARED_FIELDS, AGENT_FIELDS, ROI_FIELDS];
  const st2 = C.loadState(agentSchemas, old, MODELS);
  assert.equal(st2.runs, 500);
  assert.equal(st2.benefitMonthly, 7000);
  assert.equal(st2.horizon, 24);
  gone.forEach((id) => assert.ok(!Object.prototype.hasOwnProperty.call(st2, id), 'old key ' + id + ' is not restored'));
  assert.deepEqual(Object.keys(st2), Object.keys(C.defaultsOf(...agentSchemas)));
  const ar = C.computeAgentResults(st2, MODELS);
  assert.ok(near(ar.monthly, 500 * 0.08151104 + 300, 1e-6));
  noNaN(ar);
  const seatState = C.loadState([SHARED_FIELDS, SEAT_FIELDS, ROI_FIELDS], old, MODELS);
  gone.forEach((id) => assert.ok(!Object.prototype.hasOwnProperty.call(seatState, id), 'seats: old key ' + id + ' is not restored'));
}
console.log('sub-core tests passed');
