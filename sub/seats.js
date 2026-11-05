// seats.html: chat-assistant subscription vs API behind your own chat UI vs a local GB10 box. Needs sub/core.js and sub/ui.js.
(function () {
// ─── Constants ───
const { SHARED_FIELDS, SEAT_FIELDS, ROI_FIELDS, SEAT_PLANS, MODELS } = SubCore;
const LS_KEY = 'edulab-aicalc-seats-v1';
const SCHEMAS = [SHARED_FIELDS, SEAT_FIELDS, ROI_FIELDS];
const OPTIONS = ['sub', 'api', 'local'];
SubUI.addStrings({
  pl: {
    seatsPageTitle: 'Subskrypcje vs API vs lokalnie',
    seatsLead: 'Zespół chce asystenta czatu. Co wychodzi taniej: licencje na osobę, własny czat na API czy model na lokalnym serwerze GB10?',
    groupTeam: 'Zespół', groupPlan: 'Plan subskrypcji', plan: 'Plan', customUsd: 'Cena za osobę (USD / mies.)', planCustom: 'Własna cena',
    planChecked: 'Cena sprawdzona {date} – ', planSource: 'źródło', planVerify: 'cena do sprawdzenia',
    needsM365: 'Wymaga licencji Microsoft 365.',
    groupUsage: 'Użycie', presetsLabel: 'Gotowe poziomy użycia', presetLight: 'Lekko', presetMid: 'Średnio', presetHeavy: 'Intensywnie',
    chatsPerDay: 'Rozmowy dziennie na osobę', inTok: 'Tokeny wejścia na rozmowę', outTok: 'Tokeny wyjścia na rozmowę',
    docLang: 'Język rozmów', docPl: 'Polski', docEn: 'Angielski',
    groupApi: 'API', model: 'Model', uiOps: 'Własny czat: utrzymanie (PLN / mies.)', uiOpsHint: 'Hosting, logowanie, przechowywanie rozmów i czas administratora. Dotyczy też wariantu lokalnego.',
    groupLocal: 'Lokalnie (GB10)', localCapex: 'Cena serwera (PLN)', localAmort: 'Amortyzacja (miesiące)', localPower: 'Pobór mocy (W)',
    kwh: 'Cena prądu (PLN / kWh)', localOps: 'Obsługa lokalna (PLN / mies.)', localMaxUsers: 'Osób na jeden serwer',
    groupRoi: 'Zwrot',
    optSub: 'Subskrypcja', optApi: 'API + własny czat', optLocal: 'Lokalnie (GB10)',
    winSub: 'subskrypcja', winApi: 'API z własnym czatem', winLocal: 'lokalny serwer GB10',
    cheapest: 'Najtańsze', perUserMonth: '{value} / osobę mies.', perMonthTotal: '{value} mies.',
    brkSub: '{users} os. × {usd} USD × kurs {fx}',
    brkApi: '{users} os. × {chats} rozmów mies. × {perChat} + {ui} utrzymania czatu',
    brkLocal: '{units} × GB10: rata {rate}, prąd {power}, obsługa {ops}, czat {ui}',
    localNote: 'Przepustowość GB10 nie jest tu sprawdzana – sprawdź ją w kalkulatorze RAG.',
    apiCtxOver: 'Model nie mieści tej rozmowy w oknie kontekstu.', apiOutputOver: 'Odpowiedź przekracza limit wyjścia modelu.',
    verdict: 'Przy {chats} rozmowach dziennie na osobę najtaniej wychodzi {winner}.',
    verdictBreak: ' Subskrypcja opłaca się od {breakEven} rozmów dziennie.',
    verdictNoBreak: ' Subskrypcja nie wychodzi taniej przy żadnym użyciu.',
    barsTitle: 'Koszt miesięczny: porównanie', barsAria: 'Wykres słupkowy kosztu miesięcznego trzech wariantów',
    checkCards: 'Seats: karty mają liczbowe koszty', checkWin: 'Seats: dokładnie jedna karta wygrywa', checkBreak: 'Seats: próg opłacalności jest liczbą lub pusty',
    checkCore: 'Seats: karty zgadzają się z rdzeniem', checkRoi: 'Seats: panel zwrotu liczy koszt zwycięzcy',
  },
  en: {
    seatsPageTitle: 'Seats vs API vs local',
    seatsLead: 'A team wants a chat assistant. Which is cheaper: per-person licences, your own chat on the API, or a model on a local GB10 box?',
    groupTeam: 'Team', groupPlan: 'Subscription plan', plan: 'Plan', customUsd: 'Price per person (USD / month)', planCustom: 'Custom price',
    planChecked: 'Price checked {date} – ', planSource: 'source', planVerify: 'price to verify',
    needsM365: 'Requires a Microsoft 365 licence.',
    groupUsage: 'Usage', presetsLabel: 'Usage presets', presetLight: 'Light', presetMid: 'Medium', presetHeavy: 'Heavy',
    chatsPerDay: 'Chats per person per day', inTok: 'Input tokens per chat', outTok: 'Output tokens per chat',
    docLang: 'Chat language', docPl: 'Polish', docEn: 'English',
    groupApi: 'API', model: 'Model', uiOps: 'Own chat: upkeep (PLN / month)', uiOpsHint: 'Hosting, sign-in, chat storage and admin time. It also applies to the local option.',
    groupLocal: 'Local (GB10)', localCapex: 'Server price (PLN)', localAmort: 'Amortisation (months)', localPower: 'Power draw (W)',
    kwh: 'Electricity price (PLN / kWh)', localOps: 'Local upkeep (PLN / month)', localMaxUsers: 'People per server',
    groupRoi: 'Return',
    optSub: 'Seats', optApi: 'API + own chat', optLocal: 'Local (GB10)',
    winSub: 'seats', winApi: 'the API with your own chat', winLocal: 'a local GB10 box',
    cheapest: 'Cheapest', perUserMonth: '{value} / person / month', perMonthTotal: '{value} / month',
    brkSub: '{users} people × {usd} USD × rate {fx}',
    brkApi: '{users} people × {chats} chats/month × {perChat} + {ui} chat upkeep',
    brkLocal: '{units} × GB10: instalment {rate}, power {power}, upkeep {ops}, chat {ui}',
    localNote: 'GB10 throughput is not checked here – check it in the RAG calculator.',
    apiCtxOver: 'The model cannot fit this chat in its context window.', apiOutputOver: 'The reply exceeds the model output limit.',
    verdict: 'At {chats} chats per person per day, {winner} is the cheapest.',
    verdictBreak: ' Seats pay off from {breakEven} chats per day.',
    verdictNoBreak: ' Seats are not cheaper at any usage level.',
    barsTitle: 'Monthly cost: comparison', barsAria: 'Bar chart of the monthly cost of the three options',
    checkCards: 'Seats: cards carry numeric costs', checkWin: 'Seats: exactly one card wins', checkBreak: 'Seats: break-even is numeric or empty',
    checkCore: 'Seats: cards match the core', checkRoi: 'Seats: ROI panel uses the winner cost',
  },
});

// ─── State ───
const state = SubUI.restore(LS_KEY, SCHEMAS, MODELS);
let fields = null;
let results = null;

// ─── DOM refs ───
const settingsPanel = document.getElementById('settingsPanel');
const planSelect = document.getElementById('f-plan');
const modelSelect = document.getElementById('f-model');
const planNote = document.getElementById('planNote');
const planChecked = document.getElementById('planChecked');
const customUsdField = document.getElementById('customUsdField');
const presets = document.getElementById('presets');
const verdict = document.getElementById('verdict');
const seatCards = document.getElementById('seatCards');
const seatBars = document.getElementById('seatBars');
const roiPanel = document.getElementById('roiPanel');

// ─── Helpers ───
const t = SubUI.t;
// customUsd only matters, and only blocks, while the custom plan is chosen.
function isActive(id, s) { return id !== 'customUsd' || s.plan === 'custom'; }
function compute(s) { return SubCore.computeSeatResults(s, MODELS); }
function roiOf(s, r) {
  return SubCore.computeRoi({ costMonthly: r[r.winner].monthly, benefitMonthly: SubCore.timeBenefit(s), oneOff: s.setup + s.training, ramp: s.ramp, horizon: s.horizon });
}
function optionText(id) { return t({ sub: 'optSub', api: 'optApi', local: 'optLocal' }[id]); }
function breakdown(id, s, r) {
  const chats = s.chatsPerDay * s.workDays / 12;
  if (id === 'sub') return t('brkSub', { users: SubUI.fmtNum(s.users), usd: SubUI.fmtNum(r.plan.usd, 2), fx: SubUI.fmtNum(s.fx, 2) });
  if (id === 'api') return t('brkApi', { users: SubUI.fmtNum(s.users), chats: SubUI.fmtNum(chats, 1), perChat: SubUI.money(r.api.perChat, 3), ui: SubUI.money(s.uiOps) });
  return t('brkLocal', {
    units: SubUI.fmtNum(r.local.units),
    rate: SubUI.money(r.local.units * s.localCapex / s.localAmort),
    power: SubUI.money(r.local.units * s.localPower / 1000 * 24 * 30.4 * s.kwh),
    ops: SubUI.money(s.localOps), ui: SubUI.money(s.uiOps),
  });
}
function pageChecks() {
  const r = compute(state);
  const cards = [...seatCards.querySelectorAll('[data-option]')];
  const numeric = (v) => v !== '' && Number.isFinite(Number(v));
  const be = seatCards.dataset.breakEvenChats;
  return [
    { name: t('checkCards'), pass: cards.length === 3 && cards.every((c) => numeric(c.dataset.monthly) && numeric(c.dataset.perUser)) },
    { name: t('checkWin'), pass: cards.filter((c) => c.dataset.win === 'true').length === 1 },
    { name: t('checkBreak'), pass: be === '' || numeric(be) },
    { name: t('checkCore'), pass: cards.every((c) => c.dataset.monthly === SubUI.dataNum(r[c.dataset.option].monthly)) && seatCards.querySelector('[data-win="true"]').dataset.option === r.winner },
    { name: t('checkRoi'), pass: roiPanel.dataset.costMonthly === SubUI.dataNum(r[r.winner].monthly) },
    ...SubUI.roiPanelChecks(roiPanel, state.horizon),
  ];
}

// ─── Render ───
function renderPlan(r) {
  planSelect.querySelector('option[value="custom"]').textContent = t('planCustom');
  customUsdField.hidden = state.plan !== 'custom';
  const note = r.plan.noteKey ? t(r.plan.noteKey) : '';
  planNote.textContent = note;
  planNote.hidden = !note;
  planChecked.replaceChildren();
  if (state.plan === 'custom') return;
  if (r.plan.checkedAt) {
    planChecked.append(t('planChecked', { date: r.plan.checkedAt }),
      SubUI.el('a', { href: r.plan.source, target: '_blank', rel: 'noopener' }, t('planSource')));
  } else planChecked.append(t('planVerify'));
}
function renderCards(r) {
  seatCards.dataset.breakEvenChats = r.breakEvenChats === null ? '' : r.breakEvenChats.toFixed(1);
  seatCards.replaceChildren(...OPTIONS.map((id) => {
    const o = r[id];
    const win = r.winner === id;
    const card = SubUI.el('article', { class: 'card seat-card', 'data-option': id, 'data-monthly': SubUI.dataNum(o.monthly), 'data-per-user': SubUI.dataNum(o.perUser) });
    if (win) { card.dataset.win = 'true'; card.dataset.accent = 'seats'; }
    if (id === 'api') card.dataset.eligible = String(o.eligible);
    const head = SubUI.el('div', { class: 'card-head' }, '');
    head.append(SubUI.el('h2', { class: 'sec-title' }, optionText(id)));
    if (win) head.append(SubUI.el('span', { class: 'edu-chip chip-win' }, t('cheapest')));
    card.append(head,
      SubUI.el('p', { class: 'seat-monthly' }, t('perMonthTotal', { value: SubUI.money(o.monthly) })),
      SubUI.el('p', { class: 'seat-peruser' }, t('perUserMonth', { value: SubUI.money(o.perUser) })),
      SubUI.el('p', { class: 'hint' }, breakdown(id, state, r)));
    if (id === 'api' && !o.eligible) card.append(SubUI.el('p', { class: 'hint seat-warn' }, t(o.reason === 'ctxOver' ? 'apiCtxOver' : 'apiOutputOver')));
    if (id === 'local') card.append(SubUI.el('p', { class: 'hint' }, t('localNote')));
    return card;
  }));
}
function renderBars(r) {
  const max = Math.max(...OPTIONS.map((id) => r[id].monthly), 0);
  seatBars.replaceChildren(...OPTIONS.map((id) => {
    const share = max > 0 ? r[id].monthly / max * 100 : 0;
    const fill = SubUI.el('span', { class: 'seat-bar-fill' });
    fill.style.width = share.toFixed(1) + '%';
    const row = SubUI.el('div', { class: 'seat-bar-row', 'data-bar': id });
    if (r.winner === id) row.dataset.win = 'true';
    row.append(SubUI.el('span', { class: 'seat-bar-label' }, optionText(id)),
      SubUI.el('span', { class: 'seat-bar-track' }, ''), SubUI.el('b', { class: 'seat-bar-value' }, SubUI.money(r[id].monthly)));
    row.querySelector('.seat-bar-track').append(fill);
    return row;
  }));
}
function renderVerdict(r) {
  const winner = t({ sub: 'winSub', api: 'winApi', local: 'winLocal' }[r.winner]);
  let text = t('verdict', { chats: SubUI.fmtNum(state.chatsPerDay), winner });
  text += r.breakEvenChats === null ? t('verdictNoBreak') : t('verdictBreak', { breakEven: SubUI.fmtNum(r.breakEvenChats, 1) });
  if (verdict.textContent !== text) verdict.textContent = text;
}
function render() {
  results = compute(state);
  renderPlan(results);
  presets.querySelectorAll('[data-preset]').forEach((b) => {
    const on = Number(b.dataset.preset) === state.chatsPerDay;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  renderVerdict(results);
  renderCards(results);
  renderBars(results);
  SubUI.renderRoiPanel(roiPanel, roiOf(state, results), state);
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
  state.chatsPerDay = Number(b.dataset.preset);
  fields.sync();
  onChange();
});
SubUI.onLangChange(render);

// ─── Init ───
document.body.dataset.page = 'seats';
SubUI.fillSelect(planSelect, SEAT_PLANS.map((p) => ({ value: p.id, label: `${p.name} – ${p.usd} USD` })).concat({ value: 'custom', label: t('planCustom') }));
SubUI.fillSelect(modelSelect, MODELS.map((m) => ({ value: m.name, label: m.name })));
SubUI.renderNav('seats', { onReset: reset });
renderPlan(compute(state));
fields = SubUI.bindFields(settingsPanel, SCHEMAS, state, onChange, { isActive });
render();
if (SubUI.isVerify()) SubUI.runChecks(pageChecks());
})();
