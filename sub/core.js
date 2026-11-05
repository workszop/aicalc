// Pure, DOM-free shared core for the sub pages (seats, agent, roi).
// Prices and token factors mirror index.html; tests/sub-sync.test.cjs keeps them in step.
(function () {
// ─── Constants ───
const MODELS = [
  { id: 'gpt-5.6-luna', name: 'OpenAI GPT-5.6 Luna', pin: 0.2, pout: 1.2, ctx: 1050000, maxOutput: 128000, family: 'openai', alwaysThinks: false, tierAbove: 272000, tierIn: 0.4, tierOut: 1.8, checkedAt: '2026-09-13', source: 'https://developers.openai.com/api/docs/pricing' },
  { id: 'gpt-5.6-terra', name: 'OpenAI GPT-5.6 Terra', pin: 2, pout: 12, ctx: 1050000, maxOutput: 128000, family: 'openai', alwaysThinks: false, tierAbove: 272000, tierIn: 4, tierOut: 18, checkedAt: '2026-09-13', source: 'https://developers.openai.com/api/docs/pricing' },
  { id: 'gpt-5.6-sol', name: 'OpenAI GPT-5.6 Sol', pin: 4, pout: 20, ctx: 1050000, maxOutput: 128000, family: 'openai', alwaysThinks: false, tierAbove: 272000, tierIn: 8, tierOut: 30, checkedAt: '2026-09-13', source: 'https://developers.openai.com/api/docs/pricing' },
  { id: 'gpt-6-astra', name: 'OpenAI GPT-6 Astra', pin: 10, pout: 50, ctx: 1050000, maxOutput: 128000, family: 'openai', alwaysThinks: true, tierAbove: 272000, tierIn: 20, tierOut: 75, checkedAt: '2026-09-13', source: 'https://developers.openai.com/api/docs/pricing' },
  { id: 'claude-haiku-4-5-20251001', name: 'Anthropic Claude Haiku 4.5', pin: 1, pout: 5, ctx: 200000, maxOutput: 64000, family: 'claude', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { id: 'claude-sonnet-5', name: 'Anthropic Claude Sonnet 5', pin: 2, pout: 10, ctx: 1000000, maxOutput: 128000, family: 'claudeNew', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { id: 'claude-opus-5', name: 'Anthropic Claude Opus 5', pin: 5, pout: 25, ctx: 1000000, maxOutput: 128000, family: 'claudeNew', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { id: 'claude-fable-5-1', name: 'Anthropic Claude Fable 5.1', pin: 10, pout: 50, ctx: 1000000, maxOutput: 128000, family: 'claudeNew', alwaysThinks: true, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', pin: 0.3, pout: 1.2, ctx: 1000000, maxOutput: 384000, family: 'deepseek', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://api-docs.deepseek.com/quick_start/pricing/' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro 0813', pin: 1.32, pout: 3.96, ctx: 1000000, maxOutput: 384000, family: 'deepseek', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://api-docs.deepseek.com/quick_start/pricing/' },
];
const TOK_PER_WORD = {
  openai:    { pl: 2.32, en: 1.37, label: 'OpenAI o200k' },
  deepseek:  { pl: 2.41, en: 1.38, label: 'DeepSeek V3' },
  qwen:      { pl: 2.61, en: 1.46, label: 'Qwen3' },
  claude:    { pl: 2.32, en: 1.37, label: 'Claude (Haiku 4.5)' },
  claudeNew: { pl: 3.02, en: 1.78, label: 'Claude 4.7+ (+30%)' },
};
const BASE_FAMILY = 'openai';
const EN_WORD_FACTOR = 502 / 443;
const THINK_MULT = 3;
// usd = monthly-billed list price per seat (USD), checked 2026-11-05 (checkedAt: null means "price to verify").
const SEAT_PLANS = [
  { id: 'chatgpt-business', name: 'ChatGPT Business', usd: 25, checkedAt: '2026-11-05', source: 'https://help.openai.com/en/articles/8792828-chatgpt-business-overview' },
  { id: 'm365-copilot',     name: 'Microsoft 365 Copilot', usd: 25.2, checkedAt: '2026-11-05', source: 'https://www.microsoft.com/en-us/copilot/pricing/business', noteKey: 'needsM365' },
  { id: 'claude-team',      name: 'Claude Team', usd: 25, checkedAt: '2026-11-05', source: 'https://claude.com/pricing' },
];

// ─── Field schemas ───
const num = (def, min, max, integer) => ({ def, min, max, integer });
const SHARED_FIELDS = {
  users:      num(20, 1, 20000, true),
  workDays:   num(250, 1, 365, true),
  fx:         num(3.73, 0.1, 100, false),
  hourlyRate: num(89.29, 0, 10000, false),
  horizon:    num(36, 6, 120, true),
  docLang:    { def: 'pl', enum: ['pl', 'en'] },
};
const SEAT_FIELDS = {
  plan:          { def: 'chatgpt-business', enum: SEAT_PLANS.map((p) => p.id).concat('custom') },
  customUsd:     num(30, 0, 10000, false),
  chatsPerDay:   num(15, 0, 1000, true),
  inTok:         num(3000, 0, 1000000, true),
  outTok:        num(700, 0, 1000000, true),
  model:         { def: 'OpenAI GPT-5.6 Terra', type: 'model' },
  uiOps:         num(500, 0, 1e8, false),
  localCapex:    num(35000, 0, 1e8, true),
  localAmort:    num(36, 1, 240, true),
  localPower:    num(240, 0, 1e6, true),
  kwh:           num(1.0, 0, 100, false),
  localOps:      num(0, 0, 1e8, false),
  localMaxUsers: num(100, 1, 20000, true),
};
const AGENT_FIELDS = {
  model:     { def: 'OpenAI GPT-5.6 Luna', type: 'model' },
  runs:      num(2000, 0, 1e7, true),
  steps:     num(6, 1, 200, true),
  inTok:     num(4000, 0, 1e6, true),
  outTok:    num(400, 0, 1e6, true),
  retryPct:  num(10, 0, 500, false),
  toolPln:   num(0.05, 0, 10000, false),
  platform:  num(300, 0, 1e8, false),
  reviewPct: num(20, 0, 100, false),
  reviewMin: num(2, 0, 600, false),
  manualMin: num(12, 0, 6000, false),
};
const ROI_FIELDS = {
  roiOn:     { def: true, type: 'boolean' },
  minPerDay: num(20, 0, 480, true),
  adoption:  num(60, 0, 100, false),
  ramp:      num(3, 0, 24, true),
  setup:     num(20000, 0, 1e8, false),
  training:  num(5000, 0, 1e8, false),
};
const ROI_PAGE_FIELDS = {
  costMonthly:    num(1000, 0, 1e8, false),
  benefitMode:    { def: 'time', enum: ['time', 'amount'] },
  benefitMonthly: num(5000, 0, 1e8, false),
};

// ─── Helpers ───
function defaultsOf(...schemas) {
  const out = {};
  schemas.forEach((schema) => {
    Object.entries(schema).forEach(([id, rule]) => { out[id] = rule.def; });
  });
  return out;
}

function validateValue(rule, value) {
  if (rule.enum) return rule.enum.includes(value) ? { valid: true, error: null } : { valid: false, error: 'enum' };
  if (rule.type === 'boolean') return typeof value === 'boolean' ? { valid: true, error: null } : { valid: false, error: 'enum' };
  if (rule.type === 'model') return typeof value === 'string' && value ? { valid: true, error: null } : { valid: false, error: 'enum' };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { valid: false, error: 'number' };
  if (rule.integer && !Number.isInteger(value)) return { valid: false, error: 'integer' };
  if (value < rule.min || value > rule.max) return { valid: false, error: 'range' };
  return { valid: true, error: null };
}

function loadState(schemas, raw, models) {
  const state = defaultsOf(...schemas);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
  schemas.forEach((schema) => {
    Object.entries(schema).forEach(([id, rule]) => {
      if (!Object.prototype.hasOwnProperty.call(raw, id)) return;
      const value = raw[id];
      if (!validateValue(rule, value).valid) return;
      if (rule.type === 'model' && !(models || []).some((m) => m.name === value)) return;
      state[id] = value;
    });
  });
  return state;
}

function familyFactor(family, docLang) {
  const tokenizer = TOK_PER_WORD[family];
  if (!tokenizer) throw new Error('Unknown tokenizer family: ' + family);
  if (docLang !== 'pl' && docLang !== 'en') throw new Error('Unknown document language: ' + docLang);
  return tokenizer[docLang] / TOK_PER_WORD[BASE_FAMILY].pl * (docLang === 'en' ? EN_WORD_FACTOR : 1);
}

// Long-context tier pricing as in index.html (no off-peak here). Property names follow MODELS.
function modelRates(m, inTok) {
  let pin = m.pin;
  let pout = m.pout;
  let tiered = false;
  if (m.tierAbove != null && inTok > m.tierAbove) {
    pin = m.tierIn;
    pout = m.tierOut;
    tiered = true;
  }
  return { pin, pout, tiered };
}

function chatCost(m, s, inTok, outTok) {
  const k = familyFactor(m.family, s.docLang);
  const inT = inTok * k;
  const outT = outTok * k * (m.alwaysThinks ? THINK_MULT : 1);
  const r = modelRates(m, inT);
  const perCall = (inT * r.pin + outT * r.pout) / 1e6 * s.fx;
  const reason = inT + outT > m.ctx ? 'ctxOver' : outT > m.maxOutput ? 'outputOver' : null;
  return { perCall, inTok: inT, outTok: outT, eligible: reason === null, reason };
}

function modelOf(s, models) {
  return models.find((m) => m.name === s.model) || models[0];
}

function seatPlanOf(s) {
  if (s.plan === 'custom') return { id: 'custom', name: 'Custom', usd: s.customUsd, checkedAt: null };
  return SEAT_PLANS.find((p) => p.id === s.plan) || SEAT_PLANS[0];
}

function computeSeatResults(s, models) {
  const model = modelOf(s, models);
  const plan = seatPlanOf(s);
  const chat = chatCost(model, s, s.inTok, s.outTok);
  const perChat = chat.perCall;
  const seatPln = plan.usd * s.fx;
  const chatsPerMonth = s.chatsPerDay * s.workDays / 12;
  const subMonthly = s.users * seatPln;
  const apiMonthly = s.users * chatsPerMonth * perChat + s.uiOps;
  const units = Math.ceil(s.users / s.localMaxUsers);
  const localMonthly = units * (s.localCapex / s.localAmort + s.localPower / 1000 * 24 * 30.4 * s.kwh) + s.localOps + s.uiOps;
  const options = [['sub', subMonthly], ['api', apiMonthly], ['local', localMonthly]]
    .filter(([id]) => id !== 'api' || chat.eligible);
  // First minimum in the order sub, api, local wins ties.
  const winner = options.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
  const perChatMonthly = perChat * s.workDays / 12;
  const numerator = seatPln - s.uiOps / s.users;
  // Break-even against the API only. 'always': seats are cheaper at any usage; 'never': chats are free, so the
  // API costs only uiOps and seats never undercut it; 'from': seats are cheaper from value chats per person per day.
  const breakEven = numerator <= 0 ? { kind: 'always', value: null }
    : perChatMonthly === 0 ? { kind: 'never', value: null }
    : { kind: 'from', value: numerator / perChatMonthly };
  const breakEvenChats = breakEven.value;
  return {
    model, plan,
    sub: { monthly: subMonthly, perUser: subMonthly / s.users },
    api: { monthly: apiMonthly, perUser: apiMonthly / s.users, perChat, eligible: chat.eligible, reason: chat.reason },
    local: { monthly: localMonthly, perUser: localMonthly / s.users, units },
    winner, breakEven, breakEvenChats,
  };
}

function computeAgentResults(s, models) {
  const model = modelOf(s, models);
  const step = chatCost(model, s, s.inTok, s.outTok);
  const perStep = step.perCall;
  const llmPerRun = perStep * s.steps * (1 + s.retryPct / 100);
  const toolsPerRun = s.toolPln;
  const reviewPerRun = s.reviewPct / 100 * s.reviewMin * s.hourlyRate / 60;
  const perRun = llmPerRun + toolsPerRun + reviewPerRun;
  return {
    model, perStep, llmPerRun, toolsPerRun, reviewPerRun, perRun,
    monthly: s.runs * perRun + s.platform,
    manualMonthly: s.runs * s.manualMin * s.hourlyRate / 60,
    savedHours: Math.max(0, s.runs * (s.manualMin - s.reviewPct / 100 * s.reviewMin) / 60),
    eligible: step.eligible, reason: step.reason,
  };
}

function timeBenefit(s) {
  return s.users * s.adoption / 100 * s.minPerDay * s.workDays / 12 * s.hourlyRate / 60;
}

function roiSeries(costMonthly, benefitMonthly, oneOff, ramp, horizon) {
  const series = [-oneOff];
  for (let m = 1; m <= horizon; m++) {
    const factor = ramp > 0 ? Math.min(1, m / ramp) : 1;
    series.push(series[m - 1] + benefitMonthly * factor - costMonthly);
  }
  return series;
}

function computeRoi({ costMonthly, benefitMonthly, oneOff, ramp, horizon }) {
  const series = roiSeries(costMonthly, benefitMonthly, oneOff, ramp, horizon);
  let paybackMonth = null;
  let sumBenefit = 0;
  for (let m = 1; m <= horizon; m++) {
    if (paybackMonth === null && benefitMonthly > 0 && series[m] >= 0) paybackMonth = m;
    sumBenefit += benefitMonthly * (ramp > 0 ? Math.min(1, m / ramp) : 1);
  }
  const sumCost = costMonthly * horizon;
  const denom = sumCost + oneOff;
  const roiPct = denom === 0 ? null : (sumBenefit - sumCost - oneOff) / denom * 100;
  return { benefitMonthly, costMonthly, oneOff, horizon, sumBenefit, sumCost, netMonthly: benefitMonthly - costMonthly, paybackMonth, roiPct, series };
}

function parseRoiQuery(search) {
  const params = new URLSearchParams(search);
  const read = (key, rule) => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') return undefined;
    const value = Number(raw);
    return validateValue(rule, value).valid ? value : undefined;
  };
  const out = {};
  const cost = read('cost', ROI_PAGE_FIELDS.costMonthly);
  const oneOff = read('oneOff', ROI_FIELDS.setup);
  const users = read('users', SHARED_FIELDS.users);
  if (cost !== undefined) out.costMonthly = cost;
  if (oneOff !== undefined) { out.setup = oneOff; out.training = 0; }
  if (users !== undefined) out.users = users;
  return out;
}

// ─── Exports ───
globalThis.SubCore = {
  MODELS, TOK_PER_WORD, BASE_FAMILY, EN_WORD_FACTOR, THINK_MULT, SEAT_PLANS,
  SHARED_FIELDS, SEAT_FIELDS, AGENT_FIELDS, ROI_FIELDS, ROI_PAGE_FIELDS,
  defaultsOf, validateValue, loadState, familyFactor, modelRates, chatCost,
  seatPlanOf, computeSeatResults, computeAgentResults,
  timeBenefit, roiSeries, computeRoi, parseRoiQuery,
};
if (typeof module !== 'undefined') module.exports = globalThis.SubCore;
})();
