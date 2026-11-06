// seats.html: chat-assistant subscription vs API behind your own chat UI vs a local GB10 box. Needs sub/core.js and sub/ui.js.
(function () {
// ─── Constants ───
const { SHARED_FIELDS, SEAT_FIELDS, SEAT_PLANS, MODELS } = SubCore;
const LS_KEY = 'edulab-aicalc-seats-v1';
const SCHEMAS = [SHARED_FIELDS, SEAT_FIELDS];
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
    groupApi: 'API', model: 'Model', uiOps: 'Własny czat: utrzymanie (PLN / mies.)', uiOpsHint: 'Hosting, logowanie, przechowywanie rozmów i obsługa techniczna. Dotyczy też wariantu lokalnego.',
    groupLocal: 'Lokalnie (GB10)', localCapex: 'Cena serwera (PLN)', localAmort: 'Amortyzacja (miesiące)', localPower: 'Pobór mocy (W)',
    kwh: 'Cena prądu (PLN / kWh)', localOps: 'Obsługa lokalna (PLN / mies.)', localMaxUsers: 'Osób na jeden serwer',
    optSub: 'Subskrypcja', optApi: 'API + własny czat', optLocal: 'Lokalnie (GB10)',
    winSub: 'subskrypcja', winApi: 'API z własnym czatem', winLocal: 'lokalny serwer GB10',
    cheapest: 'Najtańsze', perUserMonth: '{value} na osobę miesięcznie', perMonthTotal: '{value} mies.',
    brkSub: '{users} os. × {usd} USD × kurs {fx}',
    // {chats} always has one decimal place, and a fractional count takes the genitive singular: "312,5 rozmowy".
    brkApi: '{users} os. × {chats} rozmowy mies. × {perChat} + {ui} utrzymania czatu',
    brkLocal: '{units} × GB10: rata {rate}, prąd {power}, obsługa {ops}, czat {ui}',
    localNote: 'Przepustowość GB10 nie jest tu sprawdzana – sprawdź ją w kalkulatorze RAG.',
    apiCtxOver: 'Model nie mieści tej rozmowy w oknie kontekstu.', apiOutputOver: 'Odpowiedź przekracza limit wyjścia modelu.',
    verdict: 'Przy {chats} {chatsWord} dziennie na osobę najtaniej wychodzi {winner}.',
    chatsLocOne: 'rozmowie', chatsLocFew: 'rozmowach', chatsLocMany: 'rozmowach',
    chatsGenOne: 'rozmowy', chatsGenFew: 'rozmów', chatsGenMany: 'rozmów',
    breakFrom: ' Subskrypcja wychodzi taniej niż API od {n} {chatsWord} dziennie na osobę.',
    breakAlways: ' Subskrypcja jest tańsza od API przy każdym użyciu.',
    breakNever: ' Subskrypcja nie wychodzi taniej niż API przy żadnym użyciu.',
    localBeatsSub: ' Lokalnie jest taniej niż subskrypcja przy tym zespole.',
    barsTitle: 'Koszt miesięczny: porównanie', barsAria: 'Wykres słupkowy kosztu miesięcznego trzech wariantów',
    checkCards: 'Seats: karty mają liczbowe koszty', checkWin: 'Seats: dokładnie jedna karta wygrywa', checkBreak: 'Seats: próg opłacalności jest liczbą tylko wtedy, gdy istnieje',
    checkCore: 'Seats: karty zgadzają się z rdzeniem',
    hWorkDays: 'Dni, w które zespół korzysta z czatu. Z nich wynika liczba rozmów w miesiącu.',
    hChatsPerDay: 'Średnio na osobę w dniu roboczym. Gotowe poziomy: lekko 5, średnio 15, intensywnie 40.',
    hInTok: 'Wszystko, co model czyta w jednej rozmowie: pytanie, wcześniejsze wiadomości i wklejone pliki. 1000 tokenów to ok. 430 polskich słów.',
    hOutTok: 'Wszystko, co model pisze w jednej rozmowie. 700 tokenów to ok. 300 polskich słów.',
    hModel: 'Model w chmurze, z którym łączy się twój czat. Cena zależy od modelu, a modele rozumujące piszą więcej tokenów.',
    hLocalCapex: 'Jednorazowy zakup serwera AI, np. komputera z układem NVIDIA GB10.',
    hLocalAmort: 'Na ile miesięcy rozkładasz cenę serwera. 36 miesięcy to zakup podzielony na 3 lata.',
    hLocalPower: 'Średni pobór prądu. Kalkulator zakłada, że serwer działa całą dobę.',
    hLocalOps: 'Opieka nad serwerem: aktualizacje, kopie zapasowe, naprawy. Wpisz 0, jeśli robi to ktoś w ramach etatu.',
    hLocalMaxUsers: 'Ile osób obsłuży jeden serwer bez długiego czekania. Przy większym zespole kalkulator dolicza kolejne serwery.',
    optionsTitle: 'Co oznacza każda opcja',
    optWhat: 'Co to jest', optPay: 'Za co płacisz', optCare: 'O co musisz zadbać', optWhen: 'Kiedy się opłaca',
    optSubWhat: 'Każda osoba dostaje konto w gotowej aplikacji dostawcy, np. ChatGPT Business, Microsoft 365 Copilot albo Claude Team. Działa od razu w przeglądarce i na telefonie.',
    optSubPay: 'Stałą kwotę miesięcznie za każdą osobę, niezależnie od tego, ile korzysta. Ceny są w USD, kalkulator przelicza je po kursie.',
    optSubCare: 'Prawie o nic: model, aplikacją i aktualizacjami zajmuje się dostawca. Ty zarządzasz kontami i zasadami korzystania.',
    optSubWhen: 'Gdy ludzie korzystają często i nikt nie chce niczego utrzymywać. Przy rzadkim użyciu płacisz za konta, które stoją bezczynnie.',
    optApiWhat: 'Firma ma własną aplikację czatu, np. Open WebUI albo LibreChat, połączoną przez API z modelem w chmurze.',
    optApiPay: 'Za tokeny: każda rozmowa kosztuje tyle, ile tekstu model przeczyta i napisze. Do tego stały koszt utrzymania czatu.',
    optApiCare: 'Hosting aplikacji, logowanie, przechowywanie rozmów i aktualizacje. W zamian sam wybierasz model i możesz go zmienić w każdej chwili.',
    optApiWhen: 'Przy umiarkowanym albo nierównym użyciu, bo płacisz tylko za to, co ludzie naprawdę wysłali. Przy bardzo intensywnym użyciu koszt tokenów rośnie.',
    optLocalWhat: 'Mały serwer AI w firmie, np. z układem NVIDIA GB10, na którym działa otwarty model. Rozmowy nie wychodzą poza firmę.',
    optLocalPay: 'Zakup serwera rozłożony na raty, prąd, obsługę i utrzymanie czatu. Koszt nie zależy od liczby rozmów, ale jeden serwer obsłuży ograniczoną liczbę osób.',
    optLocalCare: 'Sprzęt, model, aktualizacje i bezpieczeństwo, więc potrzebna jest osoba techniczna. Otwarte modele, które mieszczą się na GB10, są zwykle słabsze od najlepszych modeli w chmurze.',
    optLocalWhen: 'Gdy dane nie mogą trafić do chmury albo gdy zespół korzysta dużo i równo przez cały miesiąc.',
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
    groupApi: 'API', model: 'Model', uiOps: 'Own chat: upkeep (PLN / month)', uiOpsHint: 'Hosting, sign-in, chat storage and technical support. It also applies to the local option.',
    groupLocal: 'Local (GB10)', localCapex: 'Server price (PLN)', localAmort: 'Amortisation (months)', localPower: 'Power draw (W)',
    kwh: 'Electricity price (PLN / kWh)', localOps: 'Local upkeep (PLN / month)', localMaxUsers: 'People per server',
    optSub: 'Seats', optApi: 'API + own chat', optLocal: 'Local (GB10)',
    winSub: 'seats', winApi: 'the API with your own chat', winLocal: 'a local GB10 box',
    cheapest: 'Cheapest', perUserMonth: '{value} / person / month', perMonthTotal: '{value} / month',
    brkSub: '{users} people × {usd} USD × rate {fx}',
    brkApi: '{users} people × {chats} chats/month × {perChat} + {ui} chat upkeep',
    brkLocal: '{units} × GB10: instalment {rate}, power {power}, upkeep {ops}, chat {ui}',
    localNote: 'GB10 throughput is not checked here – check it in the RAG calculator.',
    apiCtxOver: 'The model cannot fit this chat in its context window.', apiOutputOver: 'The reply exceeds the model output limit.',
    verdict: 'At {chats} {chatsWord} per person per day, {winner} is the cheapest.',
    chatsLocOne: 'chat', chatsLocFew: 'chats', chatsLocMany: 'chats',
    chatsGenOne: 'chat', chatsGenFew: 'chats', chatsGenMany: 'chats',
    breakFrom: ' A subscription is cheaper than the API from {n} {chatsWord} per person per day.',
    breakAlways: ' A subscription is cheaper than the API at any usage.',
    breakNever: ' A subscription is never cheaper than the API.',
    localBeatsSub: ' Local hosting is cheaper than the subscription for this team.',
    barsTitle: 'Monthly cost: comparison', barsAria: 'Bar chart of the monthly cost of the three options',
    checkCards: 'Seats: cards carry numeric costs', checkWin: 'Seats: exactly one card wins', checkBreak: 'Seats: break-even is a number only when one exists',
    checkCore: 'Seats: cards match the core',
    hWorkDays: 'Days on which the team uses the chat. They set the number of chats per month.',
    hChatsPerDay: 'Average per person per working day. Presets: light 5, medium 15, heavy 40.',
    hInTok: 'Everything the model reads in one chat: the question, earlier messages and pasted files. 1000 tokens is about 430 Polish words.',
    hOutTok: 'Everything the model writes in one chat. 700 tokens is about 300 Polish words.',
    hModel: 'The cloud model your chat connects to. The price depends on the model, and reasoning models write more tokens.',
    hLocalCapex: 'A one-off purchase of an AI server, e.g. a computer with an NVIDIA GB10 chip.',
    hLocalAmort: 'Over how many months you spread the server price. 36 months spreads the purchase over 3 years.',
    hLocalPower: 'Average power draw. The calculator assumes the server runs around the clock.',
    hLocalOps: 'Looking after the server: updates, backups, repairs. Enter 0 if someone does it as part of their job.',
    hLocalMaxUsers: 'How many people one server can serve without long waits. For a bigger team the calculator adds more servers.',
    optionsTitle: 'What each option means',
    optWhat: 'What it is', optPay: 'What you pay for', optCare: 'What you look after', optWhen: 'When it pays off',
    optSubWhat: 'Each person gets an account in the provider’s ready-made app, e.g. ChatGPT Business, Microsoft 365 Copilot or Claude Team. It works straight away in the browser and on the phone.',
    optSubPay: 'A fixed monthly amount per person, however much they use it. Prices are in USD; the calculator converts them at the exchange rate.',
    optSubCare: 'Almost nothing: the provider handles the model, the app and the updates. You manage accounts and usage rules.',
    optSubWhen: 'When people use it often and nobody wants to maintain anything. With light use you pay for idle accounts.',
    optApiWhat: 'The company runs its own chat app, e.g. Open WebUI or LibreChat, connected through the API to a cloud model.',
    optApiPay: 'Tokens: each chat costs as much as the text the model reads and writes. Plus the fixed upkeep of the chat app.',
    optApiCare: 'Hosting the app, sign-in, chat storage and updates. In return you choose the model and can switch it at any time.',
    optApiWhen: 'With moderate or uneven use, because you pay only for what people actually sent. With very heavy use the token cost grows.',
    optLocalWhat: 'A small AI server on site, e.g. with an NVIDIA GB10 chip, running an open model. Chats never leave the company.',
    optLocalPay: 'The server purchase spread into instalments, electricity, upkeep and the chat app. The cost does not depend on the number of chats, but one server serves a limited number of people.',
    optLocalCare: 'Hardware, the model, updates and security, so you need a technical person. Open models that fit on a GB10 are usually weaker than the best cloud models.',
    optLocalWhen: 'When data must not go to the cloud, or when the team uses it a lot and evenly through the month.',
  },
});

SubUI.addStrings(PriceUI.STRINGS);
// Stored OpenRouter prices replace the SubCore.MODELS contents in place before the first render.
const BUILTIN_MODELS = MODELS.map((m) => Object.assign({}, m));
MODELS.splice(0, MODELS.length, ...PriceSync.applyOverrides(MODELS, PriceUI.loadStore()));

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

// ─── Helpers ───
const t = SubUI.t;
// customUsd only matters, and only blocks, while the custom plan is chosen.
function isActive(id, s) { return id !== 'customUsd' || s.plan === 'custom'; }
function compute(s) { return SubCore.computeSeatResults(s, MODELS); }
// Polish case forms of "rozmowa": loc after "Przy {n}", gen after "od {n}".
function chatsWord(n, kase) { return SubUI.plural(n, t('chats' + kase + 'One'), t('chats' + kase + 'Few'), t('chats' + kase + 'Many')); }
function usdText(usd) { return SubUI.fmtNum(usd, Number.isInteger(usd) ? 0 : String(usd).split('.')[1].length) + ' USD'; }
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
  const kind = seatCards.dataset.breakEvenKind;
  return [
    { name: t('checkCards'), pass: cards.length === 3 && cards.every((c) => numeric(c.dataset.monthly) && numeric(c.dataset.perUser)) },
    { name: t('checkWin'), pass: cards.filter((c) => c.dataset.win === 'true').length === 1 },
    { name: t('checkBreak'), pass: kind === r.breakEven.kind && (kind === 'from' ? numeric(be) : be === '') },
    { name: t('checkCore'), pass: cards.every((c) => c.dataset.monthly === SubUI.dataNum(r[c.dataset.option].monthly)) && seatCards.querySelector('[data-win="true"]').dataset.option === r.winner },
  ];
}

// ─── Render ───
function renderPlan(r) {
  SEAT_PLANS.forEach((p) => { planSelect.querySelector(`option[value="${p.id}"]`).textContent = `${p.name} – ${usdText(p.usd)}`; });
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
  seatCards.dataset.breakEvenKind = r.breakEven.kind;
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
  let text = t('verdict', { chats: SubUI.fmtNum(state.chatsPerDay), chatsWord: chatsWord(state.chatsPerDay, 'Loc'), winner });
  // The break-even compares seats with the API only, so it is dropped when the API option is out.
  if (r.api.eligible) {
    const kind = r.breakEven.kind;
    if (kind === 'from') {
      const n = Math.ceil(r.breakEven.value);
      text += t('breakFrom', { n: SubUI.fmtNum(n), chatsWord: chatsWord(n, 'Gen') });
    } else text += t(kind === 'always' ? 'breakAlways' : 'breakNever');
  }
  if (r.local.monthly < r.sub.monthly) text += t('localBeatsSub');
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
// Labels are filled in renderPlan, so they follow the language.
SubUI.fillSelect(planSelect, SEAT_PLANS.map((p) => ({ value: p.id, label: p.name })).concat({ value: 'custom', label: t('planCustom') }));
SubUI.fillSelect(modelSelect, MODELS.map((m) => ({ value: m.name, label: m.name })));
SubUI.renderNav('seats', { onReset: reset });
PriceUI.mountSubPage({ models: MODELS, builtin: BUILTIN_MODELS, modelSelect, state, defaultModel: SEAT_FIELDS.model.def, sync: () => fields.sync(), onChange });
renderPlan(compute(state));
fields = SubUI.bindFields(settingsPanel, SCHEMAS, state, onChange, { isActive });
render();
if (SubUI.isVerify()) SubUI.runChecks(pageChecks());
})();
