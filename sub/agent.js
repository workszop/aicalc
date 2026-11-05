// agent.html: cost per run and per month of an AI agent that automates a process. Needs sub/core.js and sub/ui.js.
(function () {
// ─── Constants ───
const { SHARED_FIELDS, AGENT_FIELDS, ROI_FIELDS, MODELS } = SubCore;
const LS_KEY = 'edulab-aicalc-agent-v1';
const SCHEMAS = [SHARED_FIELDS, AGENT_FIELDS, ROI_FIELDS];
// Illustrative scenarios, not measurements.
const PRESETS = { mail: { runs: 3000, steps: 4 }, report: { runs: 20, steps: 12 }, invoice: { runs: 800, steps: 5 } };
SubUI.addStrings({
  pl: {
    agentPageTitle: 'Agent / automatyzacja – koszt i zwrot',
    agentLead: 'Proces powtarza się wiele razy w miesiącu. Agent wykonuje go w kilku krokach modelu i korzysta z narzędzi. Ile kosztuje jedno uruchomienie, a ile cały miesiąc?',
    groupProcess: 'Proces', agentPresetsLabel: 'Gotowe scenariusze', presetMail: 'Obsługa maili', presetReport: 'Raport sprzedaży', presetInvoice: 'Faktury',
    presetsHint: 'Scenariusze to przykład poglądowy, nie pomiar. Dopasuj liczby do swojego procesu.',
    runs: 'Uruchomienia w miesiącu',
    groupAgent: 'Agent', model: 'Model', steps: 'Kroki modelu na uruchomienie', agentInTok: 'Tokeny wejścia na krok', agentOutTok: 'Tokeny wyjścia na krok',
    retryPct: 'Ponowienia i błędy (%)', agentDocLang: 'Język dokumentów', docPl: 'Polski', docEn: 'Angielski',
    groupTools: 'Narzędzia i platforma', toolPln: 'Narzędzia na uruchomienie (PLN)', platform: 'Platforma (PLN / mies.)',
    groupRoi: 'Zwrot',
    perRun: 'Koszt jednego uruchomienia', agentMonthly: 'Koszt agenta miesięcznie',
    runBreakdown: 'LLM {llm} · narzędzia {tools} na uruchomienie · platforma {platform} / mies.',
    unavailable: 'Niedostępne', ctxOver: 'Za długi kontekst dla modelu', outputOver: 'Za długa odpowiedź dla modelu',
    checkCard: 'Agent: karta ma liczbowe koszty', checkEligible: 'Agent: dostępność modelu to true lub false',
    agentCheckCore: 'Agent: karta zgadza się z rdzeniem', agentCheckRoi: 'Agent: panel zwrotu liczy koszt agenta i wpisaną korzyść',
  },
  en: {
    agentPageTitle: 'Agent / automation – cost and return',
    agentLead: 'A process repeats many times a month. An agent does it in a few model steps and uses tools. What does one run cost, and what does a whole month cost?',
    groupProcess: 'Process', agentPresetsLabel: 'Ready scenarios', presetMail: 'E-mail handling', presetReport: 'Sales report', presetInvoice: 'Invoices',
    presetsHint: 'The scenarios are an illustrative example, not a measurement. Adjust the numbers to your process.',
    runs: 'Runs per month',
    groupAgent: 'Agent', model: 'Model', steps: 'Model steps per run', agentInTok: 'Input tokens per step', agentOutTok: 'Output tokens per step',
    retryPct: 'Retries and errors (%)', agentDocLang: 'Document language', docPl: 'Polish', docEn: 'English',
    groupTools: 'Tools and platform', toolPln: 'Tools per run (PLN)', platform: 'Platform (PLN / month)',
    groupRoi: 'Return',
    perRun: 'Cost of one run', agentMonthly: 'Agent cost per month',
    runBreakdown: 'LLM {llm} · tools {tools} per run · platform {platform} / month',
    unavailable: 'Unavailable', ctxOver: 'Context too long for the model', outputOver: 'Output too long for the model',
    checkCard: 'Agent: card carries numeric costs', checkEligible: 'Agent: model eligibility is true or false',
    agentCheckCore: 'Agent: card matches the core', agentCheckRoi: 'Agent: ROI panel uses the agent cost and the entered benefit',
  },
});

// ─── State ───
const state = SubUI.restore(LS_KEY, SCHEMAS, MODELS);
let fields = null;
let results = null;

// ─── DOM refs ───
const settingsPanel = document.getElementById('settingsPanel');
const modelSelect = document.getElementById('f-model');
const presets = document.getElementById('presets');
const agentCard = document.getElementById('agentCard');
const roiPanel = document.getElementById('roiPanel');

// ─── Helpers ───
const t = SubUI.t;
function compute(s) { return SubCore.computeAgentResults(s, MODELS); }
function roiOf(s, r) {
  return SubCore.computeRoi({ costMonthly: r.monthly, benefitMonthly: s.benefitMonthly, oneOff: s.setup + s.training, ramp: s.ramp, horizon: s.horizon });
}
function presetMatches(p) { return state.runs === p.runs && state.steps === p.steps; }
function pageChecks() {
  const r = compute(state);
  const ds = agentCard.dataset;
  const numeric = (v) => v !== '' && Number.isFinite(Number(v));
  return [
    { name: t('checkCard'), pass: ['perRun', 'monthly'].every((k) => numeric(ds[k])) },
    { name: t('checkEligible'), pass: ds.eligible === 'true' || ds.eligible === 'false' },
    { name: t('agentCheckCore'), pass: ds.monthly === SubUI.dataNum(r.monthly) && ds.perRun === SubUI.dataNum(r.perRun, 4) },
    { name: t('agentCheckRoi'), pass: roiPanel.dataset.costMonthly === SubUI.dataNum(r.monthly) && roiPanel.dataset.benefitMonthly === SubUI.dataNum(state.benefitMonthly) },
    ...SubUI.roiPanelChecks(roiPanel, state.horizon),
  ];
}

// ─── Render ───
function renderCard(r) {
  Object.assign(agentCard.dataset, { perRun: SubUI.dataNum(r.perRun, 4), monthly: SubUI.dataNum(r.monthly), eligible: String(r.eligible) });
  const main = SubUI.el('div', { class: 'agent-main' });
  const block = (caption, value) => {
    const b = SubUI.el('div');
    b.append(SubUI.el('p', { class: 'agent-cap' }, caption), SubUI.el('p', { class: 'agent-big' }, value));
    return b;
  };
  if (r.eligible) {
    main.append(block(t('perRun'), SubUI.money(r.perRun, 4)), block(t('agentMonthly'), SubUI.money(r.monthly) + ' ' + t('perMonth')));
    agentCard.replaceChildren(main,
      SubUI.el('p', { class: 'hint' }, t('runBreakdown', { llm: SubUI.money(r.llmPerRun, 4), tools: SubUI.money(r.toolsPerRun, 4), platform: SubUI.money(state.platform) })));
  } else {
    main.append(block(t('agentMonthly'), t('unavailable')));
    agentCard.replaceChildren(main, SubUI.el('p', { class: 'agent-warn' }, t(r.reason === 'ctxOver' ? 'ctxOver' : 'outputOver')));
  }
}
function render() {
  results = compute(state);
  presets.querySelectorAll('[data-preset]').forEach((b) => {
    const on = presetMatches(PRESETS[b.dataset.preset]);
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  renderCard(results);
  // An ineligible model has no real cost, so the ROI panel is switched off in a view; the stored roiOn stays.
  SubUI.renderRoiPanel(roiPanel, roiOf(state, results), Object.assign({}, state, { roiOn: state.roiOn && results.eligible }));
}

// ─── Listeners ───
function onChange() {
  render();
  SubUI.persist(LS_KEY, state);
}
function reset() {
  Object.assign(state, SubCore.defaultsOf(...SCHEMAS));
  fields.sync();
  onChange();
}
presets.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-preset]');
  if (!b) return;
  Object.assign(state, PRESETS[b.dataset.preset]);
  fields.sync();
  onChange();
});
SubUI.onLangChange(render);

// ─── Init ───
document.body.dataset.page = 'agent';
SubUI.fillSelect(modelSelect, MODELS.map((m) => ({ value: m.name, label: m.name })));
SubUI.renderNav('agent', { onReset: reset });
fields = SubUI.bindFields(settingsPanel, SCHEMAS, state, onChange);
render();
if (SubUI.isVerify()) SubUI.runChecks(pageChecks());
})();
