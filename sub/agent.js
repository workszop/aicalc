// agent.html: cost per run and per month of an AI agent that automates a process. Needs sub/core.js and sub/ui.js.
(function () {
// ─── Constants ───
const { SHARED_FIELDS, AGENT_FIELDS, MODELS } = SubCore;
const LS_KEY = 'edulab-aicalc-agent-v1';
const SCHEMAS = [SHARED_FIELDS, AGENT_FIELDS];
// Illustrative scenarios, not measurements.
const PRESETS = { mail: { runs: 3000, steps: 4 }, report: { runs: 20, steps: 12 }, invoice: { runs: 800, steps: 5 } };
SubUI.addStrings({
  pl: {
    agentPageTitle: 'Agent / automatyzacja – koszt',
    agentLead: 'Proces powtarza się wiele razy w miesiącu. Agent wykonuje go w kilku krokach modelu i korzysta z narzędzi. Ile kosztuje jedno uruchomienie, a ile cały miesiąc?',
    groupProcess: 'Proces', agentPresetsLabel: 'Gotowe scenariusze', presetMail: 'Obsługa maili', presetReport: 'Raport sprzedaży', presetInvoice: 'Faktury',
    presetsHint: 'Scenariusze to przykład poglądowy, nie pomiar. Dopasuj liczby do swojego procesu.',
    runs: 'Uruchomienia w miesiącu',
    groupAgent: 'Agent', model: 'Model', steps: 'Kroki modelu na uruchomienie', agentInTok: 'Tokeny wejścia na krok', agentOutTok: 'Tokeny wyjścia na krok',
    retryPct: 'Ponowienia i błędy (%)', agentDocLang: 'Język dokumentów', docPl: 'Polski', docEn: 'Angielski',
    groupTools: 'Narzędzia i platforma', toolPln: 'Narzędzia na uruchomienie (PLN)', platform: 'Platforma (PLN / mies.)',
    agentStepsTitle: 'Co agent robi w jednym uruchomieniu',
    agentStep1: 'Dostaje zadanie i dane wejściowe, np. treść wiadomości albo plik.',
    agentStep2: 'Model czyta instrukcję, dane i dotychczasowe wyniki, po czym decyduje, co zrobić dalej.',
    agentStep3: 'Jeśli potrzebuje informacji albo działania, wywołuje narzędzie: wyszukuje w bazie, czyta dokument, zapisuje w systemie.',
    agentStep4: 'Wynik narzędzia wraca do modelu. Tak kończy się jeden krok: za każdy płacisz tokeny wejścia i wyjścia.',
    agentStep5: 'Pętla się powtarza, aż zadanie jest gotowe. Część kroków kończy się błędem i trzeba je ponowić.',
    agentStepsNote: 'Dlatego koszt rośnie z liczbą kroków, długością kontekstu i odsetkiem ponowień.',
    perRun: 'Koszt jednego uruchomienia', agentMonthly: 'Koszt agenta miesięcznie',
    runBreakdown: 'LLM {llm} · narzędzia {tools} na uruchomienie · platforma {platform} / mies.',
    unavailable: 'Niedostępne', ctxOver: 'Za długi kontekst dla modelu', outputOver: 'Za długa odpowiedź dla modelu',
    checkCard: 'Agent: karta ma liczbowe koszty', checkEligible: 'Agent: dostępność modelu to true lub false',
    agentCheckCore: 'Agent: karta zgadza się z rdzeniem',
  },
  en: {
    agentPageTitle: 'Agent / automation – cost',
    agentLead: 'A process repeats many times a month. An agent does it in a few model steps and uses tools. What does one run cost, and what does a whole month cost?',
    groupProcess: 'Process', agentPresetsLabel: 'Ready scenarios', presetMail: 'E-mail handling', presetReport: 'Sales report', presetInvoice: 'Invoices',
    presetsHint: 'The scenarios are an illustrative example, not a measurement. Adjust the numbers to your process.',
    runs: 'Runs per month',
    groupAgent: 'Agent', model: 'Model', steps: 'Model steps per run', agentInTok: 'Input tokens per step', agentOutTok: 'Output tokens per step',
    retryPct: 'Retries and errors (%)', agentDocLang: 'Document language', docPl: 'Polish', docEn: 'English',
    groupTools: 'Tools and platform', toolPln: 'Tools per run (PLN)', platform: 'Platform (PLN / month)',
    agentStepsTitle: 'What the agent does in one run',
    agentStep1: 'It receives the task and the input, e.g. a message or a file.',
    agentStep2: 'The model reads the instructions, the data and the results so far, then decides what to do next.',
    agentStep3: 'If it needs information or an action, it calls a tool: searches a database, reads a document, writes to a system.',
    agentStep4: 'The tool result goes back to the model. That completes one step, and each step costs input and output tokens.',
    agentStep5: 'The loop repeats until the task is done. Some steps fail and have to be retried.',
    agentStepsNote: 'That is why the cost grows with the number of steps, the context length and the retry rate.',
    perRun: 'Cost of one run', agentMonthly: 'Agent cost per month',
    runBreakdown: 'LLM {llm} · tools {tools} per run · platform {platform} / month',
    unavailable: 'Unavailable', ctxOver: 'Context too long for the model', outputOver: 'Output too long for the model',
    checkCard: 'Agent: card carries numeric costs', checkEligible: 'Agent: model eligibility is true or false',
    agentCheckCore: 'Agent: card matches the core',
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

// ─── Helpers ───
const t = SubUI.t;
function compute(s) { return SubCore.computeAgentResults(s, MODELS); }
function presetMatches(p) { return state.runs === p.runs && state.steps === p.steps; }
function pageChecks() {
  const r = compute(state);
  const ds = agentCard.dataset;
  const numeric = (v) => v !== '' && Number.isFinite(Number(v));
  return [
    { name: t('checkCard'), pass: ['perRun', 'monthly'].every((k) => numeric(ds[k])) },
    { name: t('checkEligible'), pass: ds.eligible === 'true' || ds.eligible === 'false' },
    { name: t('agentCheckCore'), pass: ds.monthly === SubUI.dataNum(r.monthly) && ds.perRun === SubUI.dataNum(r.perRun, 4) },
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
