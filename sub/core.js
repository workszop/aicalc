// Pure, DOM-free shared core for the sub pages (seats, agent).
// Prices and token factors mirror index.html; tests/sub-sync.test.cjs keeps them in step.
(function () {
// ─── Constants ───
const MODELS = [
  { id: 'gpt-5.6-luna', name: 'OpenAI GPT-5.6 Luna', pin: 0.2, pout: 1.2, ctx: 1050000, maxOutput: 128000, family: 'openai', alwaysThinks: false, tierAbove: 272000, tierIn: 0.4, tierOut: 1.8, checkedAt: '2026-09-13', source: 'https://developers.openai.com/api/docs/pricing', openrouter: 'openai/gpt-5.6-luna' },
  { id: 'gpt-5.6-terra', name: 'OpenAI GPT-5.6 Terra', pin: 2, pout: 12, ctx: 1050000, maxOutput: 128000, family: 'openai', alwaysThinks: false, tierAbove: 272000, tierIn: 4, tierOut: 18, checkedAt: '2026-09-13', source: 'https://developers.openai.com/api/docs/pricing', openrouter: 'openai/gpt-5.6-terra' },
  { id: 'gpt-5.6-sol', name: 'OpenAI GPT-5.6 Sol', pin: 4, pout: 20, ctx: 1050000, maxOutput: 128000, family: 'openai', alwaysThinks: false, tierAbove: 272000, tierIn: 8, tierOut: 30, checkedAt: '2026-09-13', source: 'https://developers.openai.com/api/docs/pricing', openrouter: 'openai/gpt-5.6-sol' },
  { id: 'gpt-6-astra', name: 'OpenAI GPT-6 Astra', pin: 10, pout: 50, ctx: 1050000, maxOutput: 128000, family: 'openai', alwaysThinks: true, tierAbove: 272000, tierIn: 20, tierOut: 75, checkedAt: '2026-09-13', source: 'https://developers.openai.com/api/docs/pricing', openrouter: 'openai/gpt-6-astra' },
  { id: 'claude-haiku-4-5-20251001', name: 'Anthropic Claude Haiku 4.5', pin: 1, pout: 5, ctx: 200000, maxOutput: 64000, family: 'claude', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://platform.claude.com/docs/en/about-claude/pricing', openrouter: 'anthropic/claude-haiku-4.5' },
  { id: 'claude-sonnet-5', name: 'Anthropic Claude Sonnet 5', pin: 2, pout: 10, ctx: 1000000, maxOutput: 128000, family: 'claudeNew', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://platform.claude.com/docs/en/about-claude/pricing', openrouter: 'anthropic/claude-sonnet-5' },
  { id: 'claude-opus-5', name: 'Anthropic Claude Opus 5', pin: 5, pout: 25, ctx: 1000000, maxOutput: 128000, family: 'claudeNew', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://platform.claude.com/docs/en/about-claude/pricing', openrouter: 'anthropic/claude-opus-5' },
  { id: 'claude-fable-5-1', name: 'Anthropic Claude Fable 5.1', pin: 10, pout: 50, ctx: 1000000, maxOutput: 128000, family: 'claudeNew', alwaysThinks: true, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-09-13', source: 'https://platform.claude.com/docs/en/about-claude/pricing', openrouter: 'anthropic/claude-fable-5.1' },
  { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', pin: 0.3, pout: 1.2, ctx: 1048576, maxOutput: 393216, family: 'deepseek', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-11-06', source: 'https://api-docs.deepseek.com/quick_start/pricing/', openrouter: 'deepseek/deepseek-v4.1-flash-1017' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro 0813', pin: 1.32, pout: 3.96, ctx: 1048576, maxOutput: 393216, family: 'deepseek', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-11-06', source: 'https://api-docs.deepseek.com/quick_start/pricing/', openrouter: 'deepseek/deepseek-v4-pro-0813' },
  { id: 'gemini-3.8-flash', name: 'Google Gemini 3.8 Flash', pin: 0.75, pout: 3.75, ctx: 1048576, maxOutput: 65536, family: 'gemini', alwaysThinks: false, tierAbove: null, tierIn: null, tierOut: null, checkedAt: '2026-11-06', source: 'https://ai.google.dev/gemini-api/docs/pricing', openrouter: 'google/gemini-3.8-flash' },
];
const TOK_PER_WORD = {
  openai:    { pl: 2.32, en: 1.37, label: 'OpenAI o200k' },
  deepseek:  { pl: 2.41, en: 1.38, label: 'DeepSeek V3' },
  qwen:      { pl: 2.61, en: 1.46, label: 'Qwen3' },
  claude:    { pl: 2.32, en: 1.37, label: 'Claude (Haiku 4.5)' },
  claudeNew: { pl: 3.02, en: 1.78, label: 'Claude 4.7+ (+30%)' },
  // Measured 2026-11-06: Gemini 3.8 Flash countTokens vs o200k on the same PL/EN UI copy (977 / 1159 words), scaled to the openai factors.
  gemini:    { pl: 2.24, en: 1.46, label: 'Gemini 3.8 Flash' },
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
  contextMode: { def: 'growing', enum: ['growing', 'flat'] },
  toolOutTok:  num(600, 0, 1e6, true),
  budget:      num(1000, 0, 1e8, false),
};
// Runs per month for the "cost at different scale" table.
const AGENT_SCALE_RUNS = [100, 1000, 10000, 100000];

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

// Input of step k (1-based) before the tokenizer factor. Growing: the model rereads the history and every tool result.
function agentStepInput(s, k) {
  return s.contextMode === 'flat' ? s.inTok : s.inTok + (k - 1) * (s.outTok + s.toolOutTok);
}

// Each step is priced on its own (long-context tier per step). The first step that does not fit decides the reason.
function computeAgentResults(s, models) {
  const model = modelOf(s, models);
  const steps = [];
  let inPerRun = 0;
  let outPerRun = 0;
  let reason = null;
  for (let i = 1; i <= s.steps; i += 1) {
    const c = chatCost(model, s, agentStepInput(s, i), s.outTok);
    const r = modelRates(model, c.inTok);
    const inCost = c.inTok * r.pin / 1e6 * s.fx;
    const outCost = c.outTok * r.pout / 1e6 * s.fx;
    inPerRun += inCost;
    outPerRun += outCost;
    steps.push({ k: i, inTok: c.inTok, outTok: c.outTok, cost: c.perCall });
    if (reason === null && c.reason) reason = c.reason;
  }
  const llmBase = inPerRun + outPerRun;
  const retryPerRun = llmBase * s.retryPct / 100;
  const llmPerRun = llmBase * (1 + s.retryPct / 100);
  const toolsPerRun = s.toolPln;
  const perRun = llmPerRun + toolsPerRun;
  const monthly = s.runs * perRun + s.platform;
  return {
    model, perStep: s.steps ? llmBase / s.steps : 0, llmPerRun, toolsPerRun, perRun,
    monthly,
    eligible: reason === null, reason,
    steps, inPerRun, outPerRun, retryPerRun,
    annual: monthly * 12,
    breakdown: {
      input: s.runs * inPerRun,
      output: s.runs * outPerRun,
      retries: s.runs * retryPerRun,
      tools: s.runs * toolsPerRun,
      platform: s.platform,
    },
  };
}

// Monthly cost when the agent needs fewer or more steps and retries than typed. Everything else stays the same.
// highEligible is false when the pessimistic run (more steps, so a longer context) no longer fits the model.
function agentRange(s, models) {
  const highSteps = Math.max(1, Math.round(s.steps * 1.5));
  const low = computeAgentResults({ ...s, steps: Math.max(1, Math.round(s.steps * 0.5)), retryPct: s.retryPct * 0.5 }, models).monthly;
  const highRun = computeAgentResults({ ...s, steps: highSteps, retryPct: s.retryPct * 2 }, models);
  return { low, typical: computeAgentResults(s, models).monthly, high: highRun.monthly, highSteps, highEligible: highRun.eligible, highReason: highRun.reason };
}

// The same agent on every model: eligible models by monthly cost (cheapest first), then the ineligible ones.
function agentModelTable(s, models) {
  const rows = models.map((m) => {
    const r = computeAgentResults({ ...s, model: m.name }, models);
    return { name: m.name, perRun: r.eligible ? r.perRun : null, monthly: r.eligible ? r.monthly : null, eligible: r.eligible, reason: r.reason };
  });
  const ok = rows.filter((r) => r.eligible).sort((a, b) => a.monthly - b.monthly);
  return ok.concat(rows.filter((r) => !r.eligible));
}

function agentScale(s, models, runsList = AGENT_SCALE_RUNS) {
  const r = computeAgentResults(s, models);
  return runsList.map((runs) => {
    const monthly = runs * r.perRun + s.platform;
    return { runs, monthly, perRunAll: runs > 0 ? monthly / runs : null, platformShare: monthly > 0 ? s.platform / monthly : 0 };
  });
}

// Runs that fit in the monthly budget after the platform; null when the model is ineligible or a run costs nothing.
function agentBudgetRuns(s, models) {
  const r = computeAgentResults(s, models);
  if (!r.eligible || !(r.perRun > 0)) return null;
  if (s.budget <= s.platform) return 0;
  return Math.floor((s.budget - s.platform) / r.perRun);
}

// ─── Exports ───
globalThis.SubCore = {
  MODELS, TOK_PER_WORD, BASE_FAMILY, EN_WORD_FACTOR, THINK_MULT, SEAT_PLANS,
  SHARED_FIELDS, SEAT_FIELDS, AGENT_FIELDS, AGENT_SCALE_RUNS,
  defaultsOf, validateValue, loadState, familyFactor, modelRates, chatCost,
  seatPlanOf, computeSeatResults, computeAgentResults,
  agentStepInput, agentRange, agentModelTable, agentScale, agentBudgetRuns,
};
if (typeof module !== 'undefined') module.exports = globalThis.SubCore;
})();
