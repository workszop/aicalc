const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const context = vm.createContext({ console, URLSearchParams });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../sub/core.js'), 'utf8'), context);
const C = vm.runInContext('globalThis.SubCore', context);
const { MODELS, SHARED_FIELDS, SEAT_FIELDS, AGENT_FIELDS } = C;
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
assert.equal(SEAT_FIELDS.model.def, 'OpenAI GPT-6.1 Sol');
assert.equal(AGENT_FIELDS.model.def, 'OpenAI GPT-6.1 Sol');
// Saves from before 2026-11-06 name models that are no longer listed: they load with the default model.
assert.equal(C.loadState(schemas, { model: 'OpenAI GPT-5.6 Terra', users: 7 }, MODELS).model, 'OpenAI GPT-6.1 Sol');
assert.equal(C.loadState(schemas, { model: 'OpenAI GPT-5.6 Terra', users: 7 }, MODELS).users, 7);
assert.equal(C.loadState([SHARED_FIELDS, AGENT_FIELDS], { model: 'Anthropic Claude Haiku 4.5', runs: 9 }, MODELS).model, 'OpenAI GPT-6.1 Sol');
['OpenAI GPT-5.6 Luna', 'OpenAI GPT-5.6 Terra', 'OpenAI GPT-5.6 Sol', 'Anthropic Claude Haiku 4.5', 'Anthropic Claude Sonnet 5', 'Anthropic Claude Opus 5']
  .forEach((name) => assert.ok(!MODELS.some((m) => m.name === name), name + ' is no longer built in'));
assert.equal(MODELS.length, 11);
assert.ok(MODELS.every((m) => m.checkedAt === '2026-11-06'), 'every built-in price checked 2026-11-06');

assert.equal(C.familyFactor('openai', 'pl'), 1);
const terra = find('Terra');
const s = { docLang: 'pl', fx: 3.73 };
assert.ok(Math.abs(C.chatCost(terra, s, 3000, 700).perCall - 0.024245) < 1e-9);
assert.equal(C.chatCost(terra, s, 2000000, 0).reason, 'ctxOver');
assert.equal(C.chatCost(terra, s, 2000000, 0).eligible, false);
assert.equal(C.chatCost(terra, s, 1000, 200000).reason, 'outputOver');
assert.equal(C.chatCost(terra, s, 1000, 100).reason, null);
const fable = find('Fable');
assert.equal(C.chatCost(fable, s, 1000, 100).outTok, 3 * 100 * C.familyFactor('claudeNew', 'pl'));
// long-context tier (Claude Haiku 5.5 above 100K prompt tokens; GPT-6.x has no long-context price)
const haiku55 = find('Haiku');
assert.equal(C.modelRates(haiku55, 100001).tiered, true);
assert.equal(C.modelRates(haiku55, 100001).pin, 0.5);
assert.equal(C.modelRates(haiku55, 100001).pout, 2.5);
assert.equal(C.modelRates(haiku55, 100000).tiered, false);
assert.equal(C.modelRates(haiku55, 1000).pin, 0.1);
assert.equal(C.modelRates(terra, 300000).tiered, false);
assert.equal(C.modelRates(terra, 300000).pin, 1);
assert.equal(C.modelRates(find('Opus'), 900000).tiered, false);

// ─── Seats model ───
const seatBase = () => ({ ...C.defaultsOf(SHARED_FIELDS, SEAT_FIELDS) });
{
  const r = C.computeSeatResults(seatBase(), MODELS);
  assert.ok(near(r.sub.monthly, 1865, 0.01));
  assert.ok(near(r.sub.perUser, 93.25, 0.01));
  assert.ok(near(r.api.monthly, 803.06, 0.01));
  assert.equal(r.local.units, 1);
  assert.ok(near(r.local.monthly, 1647.33, 0.01));
  assert.equal(r.winner, 'api');
  assert.ok(near(r.breakEvenChats, 67.56, 0.01));
  assert.equal(r.model, find('GPT-6.1 Sol'));
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
  // defaults: seats beat the API from ~135 chats per person per day
  const def = C.computeSeatResults(seatBase(), MODELS);
  assert.equal(def.breakEven.kind, 'from');
  assert.ok(near(def.breakEven.value, 67.56, 0.01));
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
  const heavy = C.computeSeatResults({ ...seatBase(), users: 20, chatsPerDay: 150 }, MODELS);
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
const agentBase = () => ({ ...C.defaultsOf(SHARED_FIELDS, AGENT_FIELDS) });
const flatBase = () => ({ ...agentBase(), contextMode: 'flat' });
{
  const r = C.computeAgentResults(flatBase(), MODELS);
  assert.equal(r.model, find('GPT-6.1 Sol'));
  assert.ok(near(r.perStep, 0.04476, 1e-7));
  assert.ok(near(r.llmPerRun, 0.295416, 1e-7));
  assert.equal(r.toolsPerRun, 0.05);
  assert.ok(near(r.perRun, 0.345416, 1e-7), 'perRun = LLM + tools');
  assert.equal(r.perRun, r.llmPerRun + r.toolsPerRun);
  assert.ok(near(r.monthly, 990.83, 0.01), 'monthly = runs x perRun + platform');
  assert.equal(r.monthly, 2000 * r.perRun + 300);
  assert.deepEqual(Object.keys(r), ['model', 'perStep', 'llmPerRun', 'toolsPerRun', 'perRun', 'monthly', 'eligible', 'reason',
    'steps', 'inPerRun', 'outPerRun', 'retryPerRun', 'annual', 'breakdown'], 'no labour-cost results');
  assert.equal(r.eligible, true);
  assert.equal(r.reason, null);
  noNaN(r);
  const z = C.computeAgentResults({ ...flatBase(), runs: 0 }, MODELS);
  assert.equal(z.monthly, 300);
  noNaN(z);
  const big = C.computeAgentResults({ ...flatBase(), inTok: 2000000 }, MODELS);
  assert.equal(big.eligible, false);
  assert.equal(big.reason, 'ctxOver');
  // the removed hourly rate, review and manual-time inputs no longer change anything
  const legacy = C.computeAgentResults({ ...flatBase(), hourlyRate: 500, reviewPct: 100, reviewMin: 60, manualMin: 600 }, MODELS);
  assert.equal(legacy.monthly, r.monthly);
  assert.equal(legacy.perRun, r.perRun);
  assert.equal(C.computeAgentResults({ ...agentBase(), model: 'missing' }, MODELS).model, MODELS[0]);
}

// ─── ROI is gone from the core ───
{
  ['ROI_FIELDS', 'ROI_PAGE_FIELDS', 'roiSeries', 'computeRoi', 'parseRoiQuery'].forEach((k) => assert.equal(C[k], undefined, k + ' is removed'));
  assert.ok(!Object.prototype.hasOwnProperty.call(SHARED_FIELDS, 'horizon'), 'horizon is removed from the shared fields');
}

// ─── Removed labour-cost fields ───
{
  const gone = ['hourlyRate', 'reviewPct', 'reviewMin', 'manualMin', 'minPerDay', 'adoption', 'benefitMode', 'roiOn', 'benefitMonthly', 'ramp', 'setup', 'training', 'horizon', 'costMonthly'];
  const all = [SHARED_FIELDS, SEAT_FIELDS, AGENT_FIELDS];
  gone.forEach((id) => all.forEach((schema) => assert.ok(!Object.prototype.hasOwnProperty.call(schema, id), id + ' is removed from every schema')));
  // An old save with the removed keys still loads: known keys are kept, removed ones are dropped.
  const old = { hourlyRate: 120, reviewPct: 50, reviewMin: 5, manualMin: 30, minPerDay: 40, adoption: 80, benefitMode: 'time', runs: 500, benefitMonthly: 7000, horizon: 24 };
  const agentSchemas = [SHARED_FIELDS, AGENT_FIELDS];
  const st2 = C.loadState(agentSchemas, old, MODELS);
  assert.equal(st2.runs, 500);
  gone.forEach((id) => assert.ok(!Object.prototype.hasOwnProperty.call(st2, id), 'old key ' + id + ' is not restored'));
  assert.deepEqual(Object.keys(st2), Object.keys(C.defaultsOf(...agentSchemas)));
  assert.equal(st2.contextMode, 'growing', 'an old save without contextMode loads the default');
  assert.equal(st2.toolOutTok, 600);
  assert.equal(st2.budget, 1000);
  const ar = C.computeAgentResults({ ...st2, contextMode: 'flat' }, MODELS);
  assert.ok(near(ar.monthly, 500 * 0.345416 + 300, 1e-6));
  noNaN(ar);
  const seatState = C.loadState([SHARED_FIELDS, SEAT_FIELDS], old, MODELS);
  gone.forEach((id) => assert.ok(!Object.prototype.hasOwnProperty.call(seatState, id), 'seats: old key ' + id + ' is not restored'));
}

// ─── Agent details (2026-11-06) ───
{
  const luna = find('Luna');
  assert.equal(AGENT_FIELDS.contextMode.def, 'growing');
  assert.deepEqual([...AGENT_FIELDS.contextMode.enum], ['growing', 'flat']);
  assert.equal(C.validateValue(AGENT_FIELDS.contextMode, 'other').error, 'enum');
  assert.equal(C.validateValue(AGENT_FIELDS.toolOutTok, 1.5).error, 'integer');
  assert.equal(C.validateValue(AGENT_FIELDS.toolOutTok, 1e6 + 1).error, 'range');
  assert.equal(C.validateValue(AGENT_FIELDS.budget, -1).error, 'range');
  assert.equal(C.validateValue(AGENT_FIELDS.budget, 1e8).error, null);

  // flat: every step reads inTok; the internal sums hold
  const f = C.computeAgentResults(flatBase(), MODELS);
  assert.equal(f.steps.length, 6);
  f.steps.forEach((st, i) => { assert.equal(st.k, i + 1); assert.equal(st.inTok, 4000); assert.equal(st.outTok, 400); assert.ok(near(st.cost, 0.04476, 1e-12)); });
  assert.ok(near(f.llmPerRun, (f.inPerRun + f.outPerRun) * 1.1, 1e-15));
  assert.ok(near(f.retryPerRun, (f.inPerRun + f.outPerRun) * 0.1, 1e-15));
  assert.equal(f.perRun, f.llmPerRun + f.toolsPerRun);
  assert.ok(near(f.annual, f.monthly * 12, 1e-9));

  // growing (default): step k reads inTok + (k-1) x (outTok + toolOutTok)
  const g = C.computeAgentResults(agentBase(), MODELS);
  assert.deepEqual([...g.steps.map((st) => st.inTok)], [4000, 5000, 6000, 7000, 8000, 9000]);
  assert.ok(g.steps.every((st) => st.outTok === 400));
  // hand check, step 3: (6000 x 2 + 400 x 10) / 1e6 x 3.73 = 0.05968
  assert.ok(near(g.steps[2].cost, 0.05968, 1e-12));
  assert.ok(near(g.inPerRun, 39000 * 2 / 1e6 * 3.73, 1e-12));
  assert.ok(near(g.outPerRun, 2400 * 10 / 1e6 * 3.73, 1e-12));
  // per run: (39 000 x 2 + 2 400 x 10) / 1e6 x 3.73 = 0.38046, x 1.1 retries = 0.418506, + 0.05 tools = 0.468506
  assert.ok(near(g.llmPerRun, 0.418506, 1e-10));
  assert.ok(near(g.perRun, 0.468506, 1e-10));
  assert.ok(near(g.monthly, 1237.012, 1e-7));
  assert.ok(near(g.annual, 14844.144, 1e-6));
  assert.ok(near(g.perStep, (g.inPerRun + g.outPerRun) / 6, 1e-15));
  assert.ok(near(g.steps.reduce((a, st) => a + st.cost, 0), g.inPerRun + g.outPerRun, 1e-15));
  assert.equal(g.eligible, true);
  noNaN(g);
  // breakdown: five parts that sum to monthly
  assert.deepEqual([...Object.keys(g.breakdown)], ['input', 'output', 'retries', 'tools', 'platform']);
  const sum = Object.values(g.breakdown).reduce((a, v) => a + v, 0);
  assert.ok(near(sum, g.monthly, 1e-9), 'breakdown sums to monthly');
  assert.ok(near(g.breakdown.input, 2000 * g.inPerRun, 1e-9));
  assert.ok(near(g.breakdown.retries, 2000 * g.retryPerRun, 1e-9));
  assert.equal(g.breakdown.tools, 100);
  assert.equal(g.breakdown.platform, 300);
  // toolOutTok is ignored in flat mode
  assert.equal(C.computeAgentResults({ ...flatBase(), toolOutTok: 99999 }, MODELS).perRun, f.perRun);
  // one step: growing equals flat
  assert.ok(near(C.computeAgentResults({ ...agentBase(), steps: 1 }, MODELS).perRun, C.computeAgentResults({ ...flatBase(), steps: 1 }, MODELS).perRun, 1e-15));

  // per-step long-context tier: Haiku 5.5 is tiered above 100k Claude tokens (76 821.2 o200k tokens of Polish text)
  const haiku = find('Haiku');
  const k = C.familyFactor('claudeNew', 'pl');
  const tierS = { ...agentBase(), model: haiku.name, inTok: 76819, outTok: 0, toolOutTok: 1, steps: 4, retryPct: 0 };
  const tr = C.computeAgentResults(tierS, MODELS);
  assert.deepEqual([...tr.steps.map((st) => st.inTok / k)].map((v) => Math.round(v)), [76819, 76820, 76821, 76822]);
  assert.ok(tr.steps[2].inTok <= 100000 && tr.steps[3].inTok > 100000, 'steps 3 and 4 straddle the threshold');
  const rate = (inT, pin) => inT * k * pin / 1e6 * 3.73;
  assert.ok(near(tr.steps[2].cost, rate(76821, 0.1), 1e-12), 'below the threshold: base price');
  assert.ok(near(tr.steps[3].cost, rate(76822, 0.5), 1e-12), 'above the threshold: tier price');
  assert.ok(near(tr.inPerRun, rate(76819 + 76820 + 76821, 0.1) + rate(76822, 0.5), 1e-12));
  assert.ok(tr.steps[3].cost / tr.steps[2].cost > 4.9);
  assert.equal(haiku.tierAbove, 100000);
  assert.equal(luna.tierAbove, null, 'GPT-6 Luna has no long-context price');

  // eligibility: the last step overflows the context even though the first fits
  const ctxS = { ...agentBase(), model: haiku.name, inTok: 700000, outTok: 1000, toolOutTok: 30000, steps: 6 };
  assert.equal(C.chatCost(haiku, ctxS, 700000, 1000).eligible, true, 'step 1 alone fits Haiku');
  const ce = C.computeAgentResults(ctxS, MODELS);
  assert.equal(ce.eligible, false);
  assert.equal(ce.reason, 'ctxOver');
  assert.equal(C.computeAgentResults({ ...ctxS, contextMode: 'flat' }, MODELS).eligible, true, 'flat: every step fits');
  // output over the limit is reported even when later steps would also overflow the context
  assert.equal(C.computeAgentResults({ ...agentBase(), outTok: 200000 }, MODELS).reason, 'outputOver');

  // range: low <= typical <= high, monthly only, steps floor at 1
  const rg = C.agentRange(agentBase(), MODELS);
  assert.deepEqual([...Object.keys(rg)], ['low', 'typical', 'high', 'highSteps', 'highEligible', 'highReason']);
  assert.equal(rg.highSteps, 9);
  assert.equal(rg.highEligible, true);
  // the pessimistic run can outgrow the context window while the typical run still fits
  const tight = { ...agentBase(), model: 'Anthropic Claude Haiku 5.5', contextMode: 'growing', inTok: 600000, outTok: 400, toolOutTok: 150000, steps: 2 };
  assert.equal(C.computeAgentResults(tight, MODELS).eligible, true);
  const tightRange = C.agentRange(tight, MODELS);
  assert.equal(tightRange.highSteps, 3);
  assert.equal(tightRange.highEligible, false);
  assert.equal(tightRange.highReason, 'ctxOver');
  assert.equal(rg.typical, g.monthly);
  assert.ok(rg.low <= rg.typical && rg.typical <= rg.high);
  const lowS = { ...agentBase(), steps: 3, retryPct: 5 };
  assert.equal(rg.low, C.computeAgentResults(lowS, MODELS).monthly);
  assert.equal(rg.high, C.computeAgentResults({ ...agentBase(), steps: 9, retryPct: 20 }, MODELS).monthly);
  const one = C.agentRange({ ...agentBase(), steps: 1 }, MODELS);
  assert.equal(one.low, C.computeAgentResults({ ...agentBase(), steps: 1, retryPct: 5 }, MODELS).monthly, 'steps never drop below 1');
  assert.equal(one.high, C.computeAgentResults({ ...agentBase(), steps: 2, retryPct: 20 }, MODELS).monthly);
  assert.ok(one.low <= one.typical && one.typical <= one.high);
  const zeroRuns = C.agentRange({ ...agentBase(), runs: 0 }, MODELS);
  assert.ok(zeroRuns.low === 300 && zeroRuns.high === 300);

  // model table: every model, eligible ones by monthly cost, ineligible last
  const mt = C.agentModelTable(agentBase(), MODELS);
  assert.equal(mt.length, MODELS.length);
  assert.deepEqual([...Object.keys(mt[0])], ['name', 'perRun', 'monthly', 'eligible', 'reason']);
  assert.ok(mt.every((row) => row.eligible));
  for (let i = 1; i < mt.length; i += 1) assert.ok(mt[i - 1].monthly <= mt[i].monthly, 'sorted by monthly');
  assert.equal(mt.find((row) => row.name === AGENT_FIELDS.model.def).monthly, g.monthly);
  const mtBig = C.agentModelTable({ ...agentBase(), inTok: 800000 }, MODELS);
  const firstBad = mtBig.findIndex((row) => !row.eligible);
  assert.ok(firstBad > 0, 'some models stay eligible');
  assert.ok(mtBig.slice(firstBad).every((row) => !row.eligible), 'ineligible models go last');
  const hRow = mtBig.find((row) => row.name === haiku.name);
  assert.equal(hRow.eligible, false); assert.equal(hRow.reason, 'ctxOver'); assert.equal(hRow.perRun, null); assert.equal(hRow.monthly, null);
  for (let i = 1; i < firstBad; i += 1) assert.ok(mtBig[i - 1].monthly <= mtBig[i].monthly);

  // scale: platform share falls as runs grow
  assert.deepEqual([...C.AGENT_SCALE_RUNS], [100, 1000, 10000, 100000]);
  const sc = C.agentScale(agentBase(), MODELS, C.AGENT_SCALE_RUNS);
  assert.equal(sc.length, 4);
  assert.deepEqual([...Object.keys(sc[0])], ['runs', 'monthly', 'perRunAll', 'platformShare']);
  assert.ok(near(sc[0].monthly, 100 * g.perRun + 300, 1e-9));
  assert.ok(near(sc[0].perRunAll, sc[0].monthly / 100, 1e-12));
  assert.ok(near(sc[0].platformShare, 300 / sc[0].monthly, 1e-12));
  assert.ok(near(sc[3].monthly, 100000 * g.perRun + 300, 1e-6));
  for (let i = 1; i < 4; i += 1) assert.ok(sc[i].platformShare < sc[i - 1].platformShare && sc[i].perRunAll < sc[i - 1].perRunAll);
  assert.ok(sc[0].platformShare > 0.5 && sc[3].platformShare < 0.05);
  assert.deepEqual([...C.agentScale(agentBase(), MODELS).map((row) => row.runs)], [100, 1000, 10000, 100000], 'default runs list');
  const freeScale = C.agentScale({ ...agentBase(), platform: 0, inTok: 0, outTok: 0, toolOutTok: 0, toolPln: 0 }, MODELS, [100]);
  assert.equal(freeScale[0].platformShare, 0);
  noNaN(freeScale[0]);

  // budget: floor((budget - platform) / perRun)
  assert.equal(C.agentBudgetRuns(agentBase(), MODELS), Math.floor(700 / g.perRun));
  assert.equal(C.agentBudgetRuns(agentBase(), MODELS), 1494);
  assert.equal(C.agentBudgetRuns({ ...agentBase(), budget: 300 }, MODELS), 0, 'budget = platform');
  assert.equal(C.agentBudgetRuns({ ...agentBase(), budget: 100 }, MODELS), 0, 'budget below platform');
  assert.equal(C.agentBudgetRuns(ctxS, MODELS), null, 'ineligible model');
  assert.equal(C.agentBudgetRuns({ ...agentBase(), inTok: 0, outTok: 0, toolOutTok: 0, toolPln: 0 }, MODELS), null, 'free runs: no finite count');
}
console.log('sub-core tests passed');
