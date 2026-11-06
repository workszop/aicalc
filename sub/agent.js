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
    groupAgent: 'Agent', model: 'Model', steps: 'Kroki modelu na uruchomienie', agentInTok: 'Tokeny wejścia w 1. kroku (instrukcja i dane)', agentOutTok: 'Tokeny wyjścia na krok',
    contextMode: 'Kontekst w kolejnych krokach', ctxGrowing: 'Rośnie z każdym krokiem', ctxFlat: 'Stały',
    contextModeHint: 'Agent w każdym kroku czyta całą dotychczasową rozmowę i wyniki narzędzi, więc wejście rośnie i koszt rośnie szybciej niż liczba kroków.',
    toolOutTok: 'Wynik narzędzia na krok (tokeny)', budget: 'Budżet miesięczny (PLN)',
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
    perYear: 'Rocznie', rangeLine: 'Zwykle od {low} do {high} / mies.',
    rangeHint: 'Agent nie ma stałej liczby kroków: przyjęto od połowy do 1,5 raza kroków i od połowy do dwukrotności ponowień.',
    budgetLine: 'Za {budget} miesięcznie zmieścisz ok. {n} {runsWord}.', budgetShort: 'Budżet nie pokrywa nawet platformy ({platform}).',
    runOne: 'uruchomienie', runFew: 'uruchomienia', runMany: 'uruchomień',
    breakdownTitle: 'Na co idą pieniądze', breakdownCaption: 'Koszt miesięczny w podziale na części.',
    partInput: 'Wejście (tokeny wejścia)', partOutput: 'Wyjście (tokeny wyjścia)', partRetries: 'Ponowienia', partTools: 'Narzędzia', partPlatform: 'Platforma',
    partInputS: 'wejście', partOutputS: 'wyjście', partRetriesS: 'ponowienia', partToolsS: 'narzędzia', partPlatformS: 'platforma',
    largestPart: 'Najwięcej kosztuje {part}: {pct} kosztu miesięcznego.',
    stepTitle: 'Kroki jednego uruchomienia',
    stepCaption: 'Tokeny modelu, czyli po przeliczeniu na tokenizer wybranego modelu i język dokumentów. Koszt kroku bez ponowień.',
    thStep: 'krok', thInTok: 'tokeny wejścia', thOutTok: 'tokeny wyjścia', thStepCost: 'koszt kroku',
    stepSum: 'suma', stepRetries: 'ponowienia (+{pct}%)', stepTools: 'narzędzia', stepTotal: 'razem za uruchomienie',
    stepGap: 'Pominięte kroki {from}-{to}',
    modelTitle: 'Ten sam agent na innych modelach', thModel: 'model', thPerRun: 'za uruchomienie', thMonthly: 'miesięcznie', thAction: 'wybór',
    modelCurrent: 'wybrany', modelPick: 'Wybierz', modelPickAria: 'Wybierz model {model}', modelPicked: 'Wybrano model {model}.',
    modelUnavailable: 'niedostępny: {reason}', reasonCtx: 'za długi kontekst', reasonOut: 'za długa odpowiedź',
    scaleTitle: 'Koszt przy różnej skali', thRuns: 'uruchomienia', thScaleMonthly: 'koszt / mies.', thPerRunAll: 'koszt jednego uruchomienia z platformą', thPlatformShare: 'udział platformy',
    scaleNote: 'Przy małej skali większość kosztu to platforma, a przy dużej model i narzędzia, czyli to, co płacisz za każde uruchomienie.',
    checkBreakdown: 'Agent: części kosztu sumują się do kosztu miesięcznego', checkStepSum: 'Agent: suma kroków z ponowieniami i narzędziami daje koszt uruchomienia',
    checkRange: 'Agent: zakres od niskiego do wysokiego obejmuje typowy koszt', checkModels: 'Agent: tabela modeli jest posortowana i oznacza wybrany model',
    checkScale: 'Agent: tabela skali ma 4 wiersze',
  },
  en: {
    agentPageTitle: 'Agent / automation – cost',
    agentLead: 'A process repeats many times a month. An agent does it in a few model steps and uses tools. What does one run cost, and what does a whole month cost?',
    groupProcess: 'Process', agentPresetsLabel: 'Ready scenarios', presetMail: 'E-mail handling', presetReport: 'Sales report', presetInvoice: 'Invoices',
    presetsHint: 'The scenarios are an illustrative example, not a measurement. Adjust the numbers to your process.',
    runs: 'Runs per month',
    groupAgent: 'Agent', model: 'Model', steps: 'Model steps per run', agentInTok: 'Input tokens in step 1 (instructions and data)', agentOutTok: 'Output tokens per step',
    contextMode: 'Context in later steps', ctxGrowing: 'Grows with every step', ctxFlat: 'Fixed',
    contextModeHint: 'In every step the agent reads the whole conversation so far and the tool results, so the input grows and the cost rises faster than the number of steps.',
    toolOutTok: 'Tool result per step (tokens)', budget: 'Monthly budget (PLN)',
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
    perYear: 'Per year', rangeLine: 'Usually from {low} to {high} / month',
    rangeHint: 'An agent has no fixed number of steps: the range assumes half to 1.5 times the steps and half to twice the retries.',
    budgetLine: 'A budget of {budget} a month fits about {n} {runsWord}.', budgetShort: 'The budget does not even cover the platform ({platform}).',
    runOne: 'run', runFew: 'runs', runMany: 'runs',
    breakdownTitle: 'Where the money goes', breakdownCaption: 'Monthly cost split into parts.',
    partInput: 'Input (input tokens)', partOutput: 'Output (output tokens)', partRetries: 'Retries', partTools: 'Tools', partPlatform: 'Platform',
    partInputS: 'input', partOutputS: 'output', partRetriesS: 'retries', partToolsS: 'tools', partPlatformS: 'the platform',
    largestPart: 'The largest part is {part}: {pct} of the monthly cost.',
    stepTitle: 'Steps of one run',
    stepCaption: 'Model tokens, i.e. after conversion to the selected model\'s tokenizer and the document language. Step cost without retries.',
    thStep: 'step', thInTok: 'input tokens', thOutTok: 'output tokens', thStepCost: 'step cost',
    stepSum: 'sum', stepRetries: 'retries (+{pct}%)', stepTools: 'tools', stepTotal: 'total per run',
    stepGap: 'Steps {from}-{to} skipped',
    modelTitle: 'The same agent on other models', thModel: 'model', thPerRun: 'per run', thMonthly: 'per month', thAction: 'choice',
    modelCurrent: 'selected', modelPick: 'Select', modelPickAria: 'Select model {model}', modelPicked: 'Model {model} selected.',
    modelUnavailable: 'unavailable: {reason}', reasonCtx: 'context too long', reasonOut: 'output too long',
    scaleTitle: 'Cost at different scale', thRuns: 'runs', thScaleMonthly: 'cost / month', thPerRunAll: 'cost of one run incl. platform', thPlatformShare: 'platform share',
    scaleNote: 'At small scale the platform makes up most of the cost; at large scale the model and the tools do, i.e. what you pay for every run.',
    checkBreakdown: 'Agent: cost parts add up to the monthly cost', checkStepSum: 'Agent: step sum with retries and tools gives the cost per run',
    checkRange: 'Agent: the low-to-high range contains the typical cost', checkModels: 'Agent: model table is sorted and marks the selected model',
    checkScale: 'Agent: scale table has 4 rows',
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
const toolOutTokField = document.getElementById('toolOutTokField');
const costBreakdown = document.getElementById('costBreakdown');
const breakdownBody = document.getElementById('breakdownBody');
const stepSection = document.getElementById('stepSection');
const stepTable = document.getElementById('stepTable');
const modelTable = document.getElementById('modelTable');
const modelTableWrap = document.getElementById('modelTableWrap');
const scaleSection = document.getElementById('scaleSection');
const scaleTable = document.getElementById('scaleTable');

// ─── Helpers ───
const t = SubUI.t;
const el = SubUI.el;
// Part order and colour roles of the monthly split; colours live in sub.css ([data-part]).
const PARTS = [['input', 'partInput'], ['output', 'partOutput'], ['retries', 'partRetries'], ['tools', 'partTools'], ['platform', 'partPlatform']];
const STEP_HEAD = 5;
const STEP_TAIL = 3;
const STEP_FOLD = 12;
function compute(s) { return SubCore.computeAgentResults(s, MODELS); }
function presetMatches(p) { return state.runs === p.runs && state.steps === p.steps; }
function isActive(id, s) { return id !== 'toolOutTok' || s.contextMode === 'growing'; }
const pct = (share) => SubUI.fmtNum(share * 100, 1) + '%';
const tok = (v) => SubUI.fmtNum(Math.round(v));
const pctPlain = (v) => SubUI.fmtNum(v, Number.isInteger(v) ? 0 : 1);
const reasonText = (reason) => t(reason === 'ctxOver' ? 'reasonCtx' : 'reasonOut');
// Steps shown in the table: all of them up to STEP_FOLD, else the first STEP_HEAD, a gap and the last STEP_TAIL.
function visibleSteps(steps) {
  if (steps.length <= STEP_FOLD) return steps;
  return steps.slice(0, STEP_HEAD).concat([null], steps.slice(-STEP_TAIL));
}
function row(cells, attrs = {}) {
  const tr = el('tr', attrs);
  cells.forEach((c) => tr.append(c));
  return tr;
}
const td = (text, cls) => el('td', cls ? { class: cls } : {}, text);
const th = (text, cls, scope = 'col') => el('th', Object.assign({ scope }, cls ? { class: cls } : {}), text);
function pageChecks() {
  const r = compute(state);
  const ds = agentCard.dataset;
  const numeric = (v) => v !== '' && Number.isFinite(Number(v));
  const n = (v) => Number(v);
  const bd = costBreakdown.dataset;
  const bdSum = PARTS.reduce((a, [k]) => a + n(bd[k]), 0);
  const stepOk = !r.eligible || Math.abs(n(stepTable.dataset.sum) * (1 + state.retryPct / 100) + state.toolPln - n(ds.perRun)) < 0.00006;
  const rows = [...modelTable.querySelectorAll('tbody tr')];
  const monthlies = rows.filter((tr) => tr.dataset.eligible === 'true').map((tr) => n(tr.dataset.monthly));
  const firstBad = rows.findIndex((tr) => tr.dataset.eligible !== 'true');
  const current = rows.filter((tr) => tr.getAttribute('aria-current') === 'true');
  return [
    { name: t('checkCard'), pass: ['perRun', 'monthly'].every((k) => numeric(ds[k])) },
    { name: t('checkEligible'), pass: ds.eligible === 'true' || ds.eligible === 'false' },
    { name: t('agentCheckCore'), pass: ds.monthly === SubUI.dataNum(r.monthly) && ds.perRun === SubUI.dataNum(r.perRun, 4) },
    { name: t('checkBreakdown'), pass: !r.eligible || Math.abs(bdSum - n(ds.monthly)) < 0.03 },
    { name: t('checkStepSum'), pass: stepOk && (!r.eligible || n(stepTable.dataset.steps) === state.steps) },
    { name: t('checkRange'), pass: !r.eligible || (n(ds.low) <= n(ds.monthly) && n(ds.monthly) <= n(ds.high)) },
    { name: t('checkModels'), pass: rows.length === MODELS.length && monthlies.every((v, i) => i === 0 || monthlies[i - 1] <= v)
      && (firstBad < 0 || rows.slice(firstBad).every((tr) => tr.dataset.eligible !== 'true'))
      && current.length === 1 && current[0].dataset.model === state.model && modelTable.dataset.current === state.model },
    { name: t('checkScale'), pass: scaleTable.dataset.rows === '4' && scaleTable.querySelectorAll('tbody tr').length === 4 },
  ];
}

// ─── Render ───
function renderCard(r, range) {
  const ok = r.eligible;
  Object.assign(agentCard.dataset, {
    perRun: SubUI.dataNum(r.perRun, 4), monthly: SubUI.dataNum(r.monthly), eligible: String(ok),
    annual: ok ? SubUI.dataNum(r.annual) : '', low: ok ? SubUI.dataNum(range.low) : '', high: ok ? SubUI.dataNum(range.high) : '',
  });
  const main = el('div', { class: 'agent-main' });
  const block = (caption, value) => {
    const b = el('div');
    b.append(el('p', { class: 'agent-cap' }, caption), el('p', { class: 'agent-big' }, value));
    return b;
  };
  const budget = el('p', { id: 'budgetLine', class: 'agent-budget' });
  const runs = SubCore.agentBudgetRuns(state, MODELS);
  budget.dataset.runs = runs === null ? '' : String(runs);
  if (runs === null) budget.hidden = true;
  else if (state.budget <= state.platform) budget.textContent = t('budgetShort', { platform: SubUI.money(state.platform) });
  else budget.textContent = t('budgetLine', { budget: SubUI.money(state.budget), n: SubUI.fmtNum(runs), runsWord: SubUI.plural(runs, t('runOne'), t('runFew'), t('runMany')) });
  if (ok) {
    main.append(block(t('perRun'), SubUI.money(r.perRun, 4)), block(t('agentMonthly'), SubUI.money(r.monthly) + ' ' + t('perMonth')), block(t('perYear'), SubUI.money(r.annual)));
    agentCard.replaceChildren(main,
      el('p', { class: 'agent-range', id: 'rangeLine' }, t('rangeLine', { low: SubUI.money(range.low), high: SubUI.money(range.high) })),
      el('p', { class: 'hint' }, t('rangeHint')),
      el('p', { class: 'hint' }, t('runBreakdown', { llm: SubUI.money(r.llmPerRun, 4), tools: SubUI.money(r.toolsPerRun, 4), platform: SubUI.money(state.platform) })),
      budget);
  } else {
    main.append(block(t('agentMonthly'), t('unavailable')));
    agentCard.replaceChildren(main, el('p', { class: 'agent-warn' }, t(r.reason === 'ctxOver' ? 'ctxOver' : 'outputOver')), budget);
  }
}
function renderBreakdown(r) {
  const ok = r.eligible;
  costBreakdown.hidden = !ok;
  PARTS.forEach(([k]) => { costBreakdown.dataset[k] = ok ? SubUI.dataNum(r.breakdown[k]) : ''; });
  if (!ok) { breakdownBody.replaceChildren(); return; }
  const total = r.monthly;
  const share = (v) => (total > 0 ? v / total : 0);
  const bar = el('div', { class: 'bd-bar', 'aria-hidden': 'true' });
  const legend = el('ul', { class: 'bd-legend' });
  PARTS.forEach(([k, key]) => {
    const v = r.breakdown[k];
    if (v > 0) {
      const seg = el('span', { class: 'bd-seg', 'data-part': k });
      seg.style.flexGrow = String(v);
      bar.append(seg);
    }
    const li = el('li', { 'data-part': k });
    li.append(el('span', { class: 'bd-swatch', 'aria-hidden': 'true' }), el('span', { class: 'bd-label' }, t(key)),
      el('span', { class: 'bd-amount' }, SubUI.money(v) + ' · ' + pct(share(v))));
    legend.append(li);
  });
  const [bigKey, bigLabel] = PARTS.reduce((best, cur) => (r.breakdown[cur[0]] > r.breakdown[best[0]] ? cur : best));
  breakdownBody.replaceChildren(el('p', { class: 'hint' }, t('breakdownCaption')), bar, legend,
    el('p', { class: 'bd-largest', 'data-largest': bigKey }, t('largestPart', { part: t(bigLabel + 'S'), pct: pct(share(r.breakdown[bigKey])) })));
}
function renderSteps(r) {
  const ok = r.eligible;
  stepSection.hidden = !ok;
  Object.assign(stepTable.dataset, { steps: ok ? String(r.steps.length) : '', sum: ok ? SubUI.dataNum(r.inPerRun + r.outPerRun, 6) : '' });
  if (!ok) { stepTable.replaceChildren(); return; }
  const thead = el('thead');
  thead.append(row([th(t('thStep')), th(t('thInTok'), 'num'), th(t('thOutTok'), 'num'), th(t('thStepCost'), 'num')]));
  const tbody = el('tbody');
  const shown = visibleSteps(r.steps);
  shown.forEach((st, i) => {
    if (st === null) {
      const gap = el('td', { colspan: '4', class: 'gap' }, '…');
      gap.setAttribute('aria-label', t('stepGap', { from: shown[i - 1].k + 1, to: shown[i + 1].k - 1 }));
      tbody.append(row([gap], { class: 'gap-row' }));
      return;
    }
    tbody.append(row([td(String(st.k)), td(tok(st.inTok), 'num'), td(tok(st.outTok), 'num'), td(SubUI.money(st.cost, 4), 'num')], { 'data-step': String(st.k) }));
  });
  const sumIn = r.steps.reduce((a, st) => a + st.inTok, 0);
  const sumOut = r.steps.reduce((a, st) => a + st.outTok, 0);
  const tfoot = el('tfoot');
  const lbl = (text) => th(text, 'lbl', 'row');
  tfoot.append(
    row([lbl(t('stepSum')), td(tok(sumIn), 'num'), td(tok(sumOut), 'num'), td(SubUI.money(r.inPerRun + r.outPerRun, 4), 'num')], { 'data-row': 'sum' }),
    row([lbl(t('stepRetries', { pct: pctPlain(state.retryPct) })), td(''), td(''), td(SubUI.money(r.retryPerRun, 4), 'num')], { 'data-row': 'retries' }),
    row([lbl(t('stepTools')), td(''), td(''), td(SubUI.money(r.toolsPerRun, 4), 'num')], { 'data-row': 'tools' }),
    row([lbl(t('stepTotal')), td(''), td(''), td(SubUI.money(r.perRun, 4), 'num')], { 'data-row': 'total', class: 'total-row' }));
  stepTable.replaceChildren(thead, tbody, tfoot);
}
function renderModels() {
  const rows = SubCore.agentModelTable(state, MODELS);
  const cheapest = rows.find((x) => x.eligible);
  Object.assign(modelTable.dataset, { cheapest: cheapest ? cheapest.name : '', current: state.model });
  const thead = el('thead');
  thead.append(row([th(t('thModel')), th(t('thPerRun'), 'num'), th(t('thMonthly'), 'num'), th(t('thAction'))]));
  const tbody = el('tbody');
  rows.forEach((x) => {
    const attrs = { 'data-model': x.name, 'data-eligible': String(x.eligible), 'data-monthly': x.eligible ? SubUI.dataNum(x.monthly) : '' };
    const isCurrent = x.name === state.model;
    if (isCurrent) Object.assign(attrs, { 'aria-current': 'true', class: 'current' });
    const action = el('td', { class: 'act' });
    if (isCurrent) action.append(el('span', { class: 'edu-chip chip-current' }, t('modelCurrent')));
    else if (x.eligible) action.append(el('button', { type: 'button', class: 'ghost-btn pick-btn', 'data-pick': x.name, 'aria-label': t('modelPickAria', { model: x.name }) }, t('modelPick')));
    const cells = [el('th', { scope: 'row', class: 'name' }, x.name)];
    if (x.eligible) cells.push(td(SubUI.money(x.perRun, 4), 'num'), td(SubUI.money(x.monthly), 'num'));
    else cells.push(el('td', { colspan: '2', class: 'unavail' }, t('modelUnavailable', { reason: reasonText(x.reason) })));
    cells.push(action);
    tbody.append(row(cells, attrs));
  });
  modelTable.replaceChildren(thead, tbody);
}
function renderScale(r) {
  scaleSection.hidden = !r.eligible;
  const rows = r.eligible ? SubCore.agentScale(state, MODELS, SubCore.AGENT_SCALE_RUNS) : [];
  scaleTable.dataset.rows = String(rows.length);
  if (!r.eligible) { scaleTable.replaceChildren(); return; }
  const thead = el('thead');
  thead.append(row([th(t('thRuns'), 'num'), th(t('thScaleMonthly'), 'num'), th(t('thPerRunAll'), 'num'), th(t('thPlatformShare'))]));
  const tbody = el('tbody');
  rows.forEach((x) => {
    const shareCell = el('td', { class: 'share' });
    const track = el('span', { class: 'share-track', 'aria-hidden': 'true' });
    const fill = el('span', { class: 'share-fill' });
    fill.style.width = (x.platformShare * 100).toFixed(1) + '%';
    track.append(fill);
    shareCell.append(el('span', { class: 'share-pct' }, pct(x.platformShare)), track);
    tbody.append(row([td(SubUI.fmtNum(x.runs), 'num'), td(SubUI.money(x.monthly), 'num'), td(SubUI.money(x.perRunAll, 4), 'num'), shareCell],
      { 'data-runs': String(x.runs), 'data-monthly': SubUI.dataNum(x.monthly), 'data-share': SubUI.dataNum(x.platformShare, 4) }));
  });
  scaleTable.replaceChildren(thead, tbody);
}
function render() {
  results = compute(state);
  presets.querySelectorAll('[data-preset]').forEach((b) => {
    const on = presetMatches(PRESETS[b.dataset.preset]);
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  toolOutTokField.hidden = !isActive('toolOutTok', state);
  renderCard(results, SubCore.agentRange(state, MODELS));
  renderBreakdown(results);
  renderSteps(results);
  renderModels();
  renderScale(results);
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
modelTable.addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-pick]');
  if (!b) return;
  state.model = b.dataset.pick;
  fields.sync();
  onChange();
  modelTableWrap.focus();
  SubUI.announce(t('modelPicked', { model: state.model }));
});
SubUI.onLangChange(render);

// ─── Init ───
document.body.dataset.page = 'agent';
SubUI.fillSelect(modelSelect, MODELS.map((m) => ({ value: m.name, label: m.name })));
SubUI.renderNav('agent', { onReset: reset });
fields = SubUI.bindFields(settingsPanel, SCHEMAS, state, onChange, { isActive });
render();
if (SubUI.isVerify()) SubUI.runChecks(pageChecks());
})();
