// Shared DOM layer for the sub pages (seats, agent, roi). Classic script: load after sub/core.js.
// Exposes globalThis.SubUI. Nothing here touches the DOM at load time, so the file also loads in node's vm.
(function () {
// ─── Constants ───
const LS_LANG = 'edulab-token-cost-lang';
const CURRENCY = 'PLN';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOBILE_QUERY = '(max-width: 768px)';
const NAV_PAGES = [
  { id: 'rag', href: 'index.html', key: 'navRag' },
  { id: 'seats', href: 'seats.html', key: 'navSeats' },
  { id: 'agent', href: 'agent.html', key: 'navAgent' },
  { id: 'roi', href: 'roi.html', key: 'navRoi' },
];
const T = {
  pl: {
    // nav and page furniture
    navLabel: 'Kalkulatory', navRag: 'Asystent RAG', navSeats: 'Subskrypcje vs API', navAgent: 'Agent / automatyzacja', navRoi: 'Zwrot z inwestycji',
    langGroup: 'Język / Language', settingsTitle: 'Ustawienia', settingsDone: 'Gotowe', closeSettings: 'Zamknij ustawienia',
    reset: 'Resetuj', resetDone: 'Przywrócono wartości domyślne.',
    shortcuts: 'Skróty: Alt+R resetuje stronę · L zmienia język · Esc zamyka ustawienia',
    estimateNote: 'Kwoty netto w PLN, bez VAT. To szacunki, nie oferta.',
    invalidNote: 'Popraw zaznaczone pola – wyniki wrócą, gdy wartości będą poprawne.',
    errNumber: 'Wpisz liczbę.', errInteger: 'Wpisz liczbę całkowitą.', errRange: 'Dozwolony zakres: {min}–{max}.', errEnum: 'Wybierz jedną z opcji.',
    checksTitle: 'Testy kalkulatora', checksResult: 'Wynik: {passed}/{total}.',
    perMonth: '/ mies.',
    // shared and ROI fields
    users: 'Liczba osób', workDays: 'Dni robocze w roku', fx: 'Kurs USD/PLN', hourlyRate: 'Koszt godziny pracy (PLN)', horizon: 'Horyzont (miesiące)',
    roiOn: 'Pokaż zwrot z inwestycji', minPerDay: 'Oszczędzone minuty dziennie na osobę', adoption: 'Odsetek osób, które korzystają (%)',
    ramp: 'Rozruch (miesiące do pełnego efektu)', setup: 'Wdrożenie (PLN, jednorazowo)', training: 'Szkolenia (PLN, jednorazowo)',
    // ROI panel
    roiTitle: 'Zwrot z inwestycji', tileBenefit: 'Korzyść miesięcznie', tileCost: 'Koszt miesięcznie', tileNet: 'Netto miesięcznie przy pełnym efekcie', tilePayback: 'Zwrot',
    paybackIn: 'Inwestycja zwraca się w {month}. miesiącu.', paybackShort: '{month}. miesiąc', paybackNone: 'Brak zwrotu w horyzoncie {horizon} mies.', paybackNoneShort: 'brak',
    roiSentence: 'W horyzoncie {horizon} mies. zwrot z inwestycji wynosi {pct}: korzyść {benefit} wobec kosztów {cost} (z nakładami jednorazowymi).',
    roiUndefined: 'Zwrotu z inwestycji nie da się policzyć, bo koszty i nakłady wynoszą zero.',
    roiCaveat: 'Zaoszczędzony czas to wartość, nie gotówka – zamienia się w pieniądze dopiero, gdy zostanie wykorzystany na inną pracę.',
    roiOff: 'Panel zwrotu z inwestycji jest wyłączony.',
    chartTitle: 'Skumulowany wynik netto', chartSub: 'Start od nakładów jednorazowych, potem co miesiąc korzyść minus koszt.',
    axisMonth: 'Miesiąc', axisNet: 'PLN netto, narastająco', chartPayback: 'zwrot', chartPoint: 'Miesiąc {month}: {value}',
    chartAria: 'Wykres skumulowanego wyniku netto przez {horizon} mies.; {payback}',
  },
  en: {
    navLabel: 'Calculators', navRag: 'RAG assistant', navSeats: 'Seats vs API', navAgent: 'Agent / automation', navRoi: 'Return on investment',
    langGroup: 'Język / Language', settingsTitle: 'Settings', settingsDone: 'Done', closeSettings: 'Close settings',
    reset: 'Reset', resetDone: 'Defaults restored.',
    shortcuts: 'Shortcuts: Alt+R resets the page · L switches language · Esc closes settings',
    estimateNote: 'Net amounts in PLN, excluding VAT. These are estimates, not quotes.',
    invalidNote: 'Fix the highlighted fields – the results come back once the values are valid.',
    errNumber: 'Enter a number.', errInteger: 'Enter a whole number.', errRange: 'Allowed range: {min}–{max}.', errEnum: 'Choose one of the options.',
    checksTitle: 'Calculator checks', checksResult: 'Result: {passed}/{total}.',
    perMonth: '/ month',
    users: 'People', workDays: 'Working days per year', fx: 'USD/PLN rate', hourlyRate: 'Cost of an hour of work (PLN)', horizon: 'Horizon (months)',
    roiOn: 'Show return on investment', minPerDay: 'Minutes saved per person per day', adoption: 'Share of people who use it (%)',
    ramp: 'Ramp-up (months to full effect)', setup: 'Setup (PLN, one-off)', training: 'Training (PLN, one-off)',
    roiTitle: 'Return on investment', tileBenefit: 'Benefit per month', tileCost: 'Cost per month', tileNet: 'Net per month at full effect', tilePayback: 'Payback',
    paybackIn: 'The investment pays back in month {month}.', paybackShort: 'month {month}', paybackNone: 'No payback within {horizon} months', paybackNoneShort: 'none',
    roiSentence: 'Over {horizon} months the return on investment is {pct}: {benefit} of benefit against {cost} of cost (one-off outlays included).',
    roiUndefined: 'The return on investment cannot be computed because costs and outlays are zero.',
    roiCaveat: 'Time saved is value, not cash – it becomes money only when it is used for other work.',
    roiOff: 'The return on investment panel is off.',
    chartTitle: 'Cumulative net result', chartSub: 'Starts at the one-off outlays, then adds benefit minus cost every month.',
    axisMonth: 'Month', axisNet: 'Net PLN, cumulative', chartPayback: 'payback', chartPoint: 'Month {month}: {value}',
    chartAria: 'Chart of the cumulative net result over {horizon} months; {payback}',
  },
};

// ─── State ───
let lang = 'pl';
try { const stored = globalThis.localStorage && globalThis.localStorage.getItem(LS_LANG); if (stored === 'pl' || stored === 'en') lang = stored; } catch (_) {}
const langListeners = [];
let resetHandler = null;
const drawer = { open: false, media: null };

// ─── DOM refs ───
// Resolved lazily (the shell markup is described in the Task 5 report): #app, #settingsPanel, #settingsToggle,
// #settingsClose, #settingsBackdrop, #resultsPanel, #checksPanel, #live, header.edu-header.
const $ = (id) => document.getElementById(id);

// ─── Helpers ───
function t(key, vars) {
  let s = (T[lang] && T[lang][key]) ?? T.pl[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}
const getLang = () => lang;
const locale = () => (lang === 'pl' ? 'pl-PL' : 'en-GB');
function fmtNum(v, d = 0) { return new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }).format(v); }
function money(v, digits) { return fmtNum(v, digits ?? (Math.abs(v) < 10 ? 2 : 0)) + ' ' + CURRENCY; }
function moneyShort(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return fmtNum(v / 1e6, 1) + (lang === 'pl' ? ' mln' : 'M');
  if (a >= 1e3) return fmtNum(v / 1e3, 0) + (lang === 'pl' ? ' tys.' : 'k');
  return fmtNum(v, 0);
}
// Polish plural form for a whole count: 1 -> one, 2-4 / 22-24 ... (not 12-14) -> few, else many.
// English needs only one / other, so pass the plural twice: plural(n, 'chat', 'chats', 'chats').
function plural(n, one, few, many) {
  const a = Math.abs(n);
  if (a === 1) return one;
  const d = a % 10;
  const h = a % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
}
// Raw number for a data-* attribute: rounded to d decimals, '' for null / non-finite.
function dataNum(v, d = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return String(Object.is(r, -0) ? 0 : r);
}
function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}
function svgEl(tag, attrs = {}, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}
const isVerify = () => new URLSearchParams(location.search).has('verify');
function announce(message) { const live = $('live'); if (live) live.textContent = message; }

function applyI18n(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
  root.querySelectorAll('[data-t-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.tAria)); });
  root.querySelectorAll('.field-error[data-err]').forEach((n) => { n.textContent = errorText(n.dataset.err, n.dataset.min, n.dataset.max); });
  document.querySelectorAll('[data-lang]').forEach((b) => {
    b.classList.toggle('active', b.dataset.lang === lang);
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  });
}
function setLang(next) {
  if (next !== 'pl' && next !== 'en') return;
  lang = next;
  try { localStorage.setItem(LS_LANG, next); } catch (_) {}
  applyI18n();
  langListeners.forEach((fn) => fn(next));
}
function onLangChange(fn) { langListeners.push(fn); }
// Page scripts register their own strings; pl and en must have the same keys and may not shadow shared ones.
function addStrings(strings) {
  const pl = Object.keys((strings && strings.pl) || {});
  const en = Object.keys((strings && strings.en) || {});
  const missing = pl.filter((k) => !en.includes(k)).concat(en.filter((k) => !pl.includes(k)));
  if (missing.length) throw new Error('addStrings: pl/en key mismatch: ' + missing.join(', '));
  const clash = pl.filter((k) => Object.prototype.hasOwnProperty.call(T.pl, k) && (T.pl[k] !== strings.pl[k] || T.en[k] !== strings.en[k]));
  if (clash.length) throw new Error('addStrings: key already defined: ' + clash.join(', '));
  Object.assign(T.pl, strings.pl);
  Object.assign(T.en, strings.en);
}
function onReset(fn) { resetHandler = fn; }

// ─── Fields ───
function errorText(code, min, max) {
  if (code === 'range') return t('errRange', { min: fmtNum(Number(min), Number(min) % 1 ? 2 : 0), max: fmtNum(Number(max), Number(max) % 1 ? 2 : 0) });
  return t({ number: 'errNumber', integer: 'errInteger', enum: 'errEnum' }[code] || 'errNumber');
}
function fieldKind(node, rule) {
  if (node.matches('input[type="checkbox"]')) return 'checkbox';
  if (node.matches('select')) return 'select';
  if (node.matches('input')) return 'number';
  if (rule.enum) return 'seg';
  throw new Error('Unsupported [data-field] element for ' + node.dataset.field);
}
// opts.isActive(fieldId, state) -> boolean: an invalid field that is not active neither blocks onChange
// nor counts toward body[data-state="invalid"]. Enum / segmented / checkbox commits always reach onChange.
function bindFields(root, schemas, state, onChange, opts = {}) {
  const isActive = opts.isActive || (() => true);
  const ruleOf = (id) => { for (const s of schemas) if (Object.prototype.hasOwnProperty.call(s, id)) return s[id]; return null; };
  const invalid = new Set();
  const entries = [...root.querySelectorAll('[data-field]')].map((node) => {
    const id = node.dataset.field;
    const rule = ruleOf(id);
    if (!rule) throw new Error('No schema for field ' + id);
    const kind = fieldKind(node, rule);
    const error = el('p', { class: 'field-error', id: 'err-' + id });
    (node.closest('.field') || node).after(error);
    node.setAttribute('aria-describedby', [node.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
    if (kind === 'number') {
      if (rule.min !== undefined) node.min = rule.min;
      if (rule.max !== undefined) node.max = rule.max;
      node.step = rule.integer ? '1' : 'any';
      if (!node.getAttribute('inputmode')) node.setAttribute('inputmode', rule.integer ? 'numeric' : 'decimal');
    }
    return { id, node, rule, kind, error };
  });
  const blocking = () => [...invalid].filter((id) => isActive(id, state));
  const syncBody = () => { document.body.dataset.state = blocking().length ? 'invalid' : 'ready'; };
  const markValid = (e) => { e.node.removeAttribute('aria-invalid'); delete e.error.dataset.err; e.error.textContent = ''; };
  const read = (e, source) => {
    if (e.kind === 'checkbox') return e.node.checked;
    if (e.kind === 'select') return e.node.value;
    if (e.kind === 'seg') return source.dataset.value;
    const raw = e.node.value.trim();
    return raw === '' ? NaN : Number(raw);
  };
  const write = (e) => {
    const v = state[e.id];
    if (e.kind === 'checkbox') e.node.checked = Boolean(v);
    else if (e.kind === 'seg') e.node.querySelectorAll('button[data-value]').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === v);
      b.setAttribute('aria-pressed', String(b.dataset.value === v));
    });
    else e.node.value = String(v);
  };
  const commit = (e, source) => {
    const value = read(e, source);
    const res = SubCore.validateValue(e.rule, value);
    if (!res.valid) {
      invalid.add(e.id);
      e.node.setAttribute('aria-invalid', 'true');
      Object.assign(e.error.dataset, { err: res.error, min: e.rule.min ?? '', max: e.rule.max ?? '' });
      e.error.textContent = errorText(res.error, e.rule.min, e.rule.max);
      syncBody();
      return;
    }
    invalid.delete(e.id);
    markValid(e);
    state[e.id] = value;
    if (e.kind === 'seg') write(e);
    syncBody();
    if (e.kind !== 'number' || !blocking().length) onChange(e.id);
  };
  entries.forEach((e) => {
    if (e.kind === 'seg') e.node.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-value]'); if (b && e.node.contains(b)) commit(e, b); });
    else e.node.addEventListener(e.kind === 'number' ? 'input' : 'change', () => commit(e));
  });
  function sync() { invalid.clear(); entries.forEach((e) => { markValid(e); write(e); }); syncBody(); }
  sync();
  return { sync, isValid: () => blocking().length === 0, invalid };
}
function fillSelect(select, options) {
  select.replaceChildren(...options.map((o) => el('option', { value: o.value }, o.label)));
}

// ─── Persistence ───
function persist(key, state) {
  try { localStorage.setItem(key, JSON.stringify(state)); return true; } catch (_) { return false; }
}
function restore(key, schemas, models) {
  let raw = null;
  try { const text = localStorage.getItem(key); raw = text ? JSON.parse(text) : null; } catch (_) { raw = null; }
  return SubCore.loadState(schemas, raw, models);
}

// ─── Render: nav and drawer ───
function renderNav(current, opts = {}) {
  if (opts.onReset) onReset(opts.onReset);
  let header = document.querySelector('header.edu-header');
  if (!header) { header = el('header', { class: 'edu-header' }); document.body.prepend(header); }
  const inner = el('div', { class: 'edu-header-inner' });
  const brand = el('a', { class: 'edu-brand', href: 'index.html' });
  brand.append(el('img', { class: 'edu-logo', alt: 'edulab', src: 'assets/edulab-logo.png', width: '64', height: '64' }), el('span', { class: 'edu-wordmark' }, 'edulab'));
  const nav = el('nav', { class: 'sub-nav', 'data-t-aria': 'navLabel' });
  NAV_PAGES.forEach((p) => {
    const a = el('a', { href: p.href, 'data-nav': p.id, 'data-t': p.key });
    if (p.id === current) a.setAttribute('aria-current', 'page');
    nav.append(a);
  });
  const toggle = el('button', { type: 'button', class: 'ghost-btn', id: 'settingsToggle', 'aria-controls': 'settingsPanel', 'aria-expanded': 'false', 'data-t': 'settingsTitle' });
  const reset = el('button', { type: 'button', class: 'ghost-btn', id: 'resetBtn', 'aria-keyshortcuts': 'Alt+R', 'data-t': 'reset' });
  const seg = el('div', { class: 'edu-seg', role: 'group', 'data-t-aria': 'langGroup' });
  seg.append(el('button', { type: 'button', 'data-lang': 'pl' }, 'PL'), el('button', { type: 'button', 'data-lang': 'en' }, 'EN'));
  inner.append(brand, nav, el('span', { class: 'header-spacer' }), toggle, reset, seg);
  header.replaceChildren(inner);
  seg.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
  reset.addEventListener('click', runReset);
  toggle.addEventListener('click', () => setDrawer(true));
  initDrawer();
  if (!renderNav.wired) { document.addEventListener('keydown', onKeydown); renderNav.wired = true; }
  applyI18n();
  return header;
}
function runReset() {
  if (resetHandler) resetHandler();
  announce(t('resetDone'));
}
function initDrawer() {
  const panel = $('settingsPanel');
  if (!panel || drawer.media) return;
  drawer.media = window.matchMedia(MOBILE_QUERY);
  const close = $('settingsClose');
  const backdrop = $('settingsBackdrop');
  if (close) close.addEventListener('click', () => setDrawer(false));
  if (backdrop) backdrop.addEventListener('click', () => setDrawer(false));
  drawer.media.addEventListener('change', () => setDrawer(false, false));
  syncDrawer();
}
function syncDrawer() {
  const app = $('app');
  const panel = $('settingsPanel');
  if (!app || !panel) return;
  const open = Boolean(drawer.media && drawer.media.matches && drawer.open);
  app.dataset.settings = open ? 'open' : 'closed';
  const toggle = $('settingsToggle');
  if (toggle) toggle.setAttribute('aria-expanded', String(open));
  const backdrop = $('settingsBackdrop');
  if (backdrop) backdrop.hidden = !open;
  const results = $('resultsPanel');
  if (results) results.inert = open;
  const header = document.querySelector('header.edu-header');
  if (header) header.inert = open;
  if (open) { panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); }
  else { panel.removeAttribute('role'); panel.removeAttribute('aria-modal'); }
}
function setDrawer(open, restoreFocus = true) {
  drawer.open = Boolean(open && drawer.media && drawer.media.matches);
  syncDrawer();
  if (drawer.open) { const c = $('settingsClose'); if (c) c.focus(); }
  else if (restoreFocus && drawer.media && drawer.media.matches) { const tg = $('settingsToggle'); if (tg) tg.focus(); }
}
function trapFocus(e) {
  const panel = $('settingsPanel');
  const items = [...panel.querySelectorAll('button, input, select, summary, a[href], [tabindex="0"]')]
    .filter((n) => !n.disabled && n.getClientRects().length > 0);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const inside = panel.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
}
function onKeydown(e) {
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R')) { e.preventDefault(); runReset(); return; }
  if (drawer.open && e.key === 'Escape') { e.preventDefault(); setDrawer(false); return; }
  if (drawer.open && e.key === 'Tab') { trapFocus(e); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.key === 'l' || e.key === 'L') setLang(lang === 'pl' ? 'en' : 'pl');
}

// ─── Render: ROI panel ───
function buildRoiPanel(node) {
  node.classList.add('roi-panel');
  if (!node.hasAttribute('data-accent')) node.setAttribute('data-accent', 'roi');
  const head = el('div', { class: 'card-head' });
  head.append(el('h2', { class: 'sec-title', id: 'roiTitle', 'data-t': 'roiTitle' }));
  node.setAttribute('aria-labelledby', 'roiTitle');
  const body = el('div', { class: 'roi-body', 'data-results': '' });
  const tiles = el('div', { class: 'grid-4 roi-tiles' });
  const parts = { tiles: {} };
  [['benefit', 'tileBenefit'], ['cost', 'tileCost'], ['net', 'tileNet'], ['payback', 'tilePayback']].forEach(([id, key]) => {
    const tile = el('div', { class: 'stat roi-tile', 'data-tile': id });
    const value = el('b');
    tile.append(el('span', { 'data-t': key }), value);
    tiles.append(tile);
    parts.tiles[id] = value;
  });
  parts.payback = el('p', { class: 'verdict', 'data-roi': 'payback', 'aria-live': 'polite' });
  parts.sentence = el('p', { class: 'roi-sentence', 'data-roi': 'sentence' });
  const fig = el('figure', { class: 'chart-card' });
  const cap = el('figcaption');
  cap.append(el('p', { class: 'chart-title', 'data-t': 'chartTitle' }), el('p', { class: 'chart-sub', 'data-t': 'chartSub' }));
  const wrap = el('div', { class: 'chart-wrap' });
  parts.svg = svgEl('svg', { 'data-roi': 'chart', role: 'img' });
  wrap.append(parts.svg);
  fig.append(cap, wrap);
  parts.caveat = el('p', { class: 'hint', 'data-roi': 'caveat' });
  body.append(tiles, parts.payback, parts.sentence, fig, parts.caveat);
  const off = el('p', { class: 'hint roi-off', 'data-roi': 'off', 'data-t': 'roiOff' });
  node.replaceChildren(head, body, off);
  node.roiParts = parts;
  return parts;
}
// opts.caveat (default true): show the "time saved is value, not cash" note; pages whose benefit is not time turn it off.
function renderRoiPanel(node, roi, state, opts = {}) {
  const parts = node.roiParts || buildRoiPanel(node);
  const on = state.roiOn !== false && Boolean(roi);
  const horizon = roi ? roi.horizon : state.horizon;
  Object.assign(node.dataset, {
    on: String(on),
    benefitMonthly: roi ? dataNum(roi.benefitMonthly) : '',
    costMonthly: roi ? dataNum(roi.costMonthly) : '',
    netMonthly: roi ? dataNum(roi.netMonthly) : '',
    oneOff: roi ? dataNum(roi.oneOff) : '',
    paybackMonth: roi && roi.paybackMonth !== null ? String(roi.paybackMonth) : '',
    roiPct: roi ? dataNum(roi.roiPct, 1) : '',
    seriesLength: roi ? String(roi.series.length) : '',
    horizon: String(horizon),
  });
  applyI18n(node);
  if (!on) return;
  const pay = roi.paybackMonth;
  parts.tiles.benefit.textContent = money(roi.benefitMonthly) + ' ' + t('perMonth');
  parts.tiles.cost.textContent = money(roi.costMonthly) + ' ' + t('perMonth');
  parts.tiles.net.textContent = money(roi.netMonthly) + ' ' + t('perMonth');
  parts.tiles.payback.textContent = pay === null ? t('paybackNoneShort') : t('paybackShort', { month: pay });
  const paybackText = pay === null ? t('paybackNone', { horizon }) : t('paybackIn', { month: pay });
  if (parts.payback.textContent !== paybackText) parts.payback.textContent = paybackText;
  parts.sentence.textContent = roi.roiPct === null ? t('roiUndefined')
    : t('roiSentence', { horizon, pct: fmtNum(roi.roiPct, 1) + '%', benefit: money(roi.sumBenefit), cost: money(roi.sumCost + roi.oneOff) });
  parts.caveat.hidden = opts.caveat === false;
  parts.caveat.textContent = t('roiCaveat');
  parts.svg.setAttribute('aria-label', t('chartAria', { horizon, payback: paybackText }));
  renderLineChart(parts.svg, roi.series, { paybackMonth: pay });
}

// ─── Render: line chart ───
function niceStep(range, target) {
  const raw = range / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}
function renderLineChart(svg, series, opts = {}) {
  svg.chartArgs = { series, opts };
  const host = svg.parentElement;
  const width = Math.max(240, Math.round((host && host.clientWidth) || 600));
  const height = Math.round(Math.min(320, Math.max(200, width * 0.42)));
  const m = { top: 30, right: 16, bottom: 44, left: 70 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;
  const finite = series.filter(Number.isFinite);
  let lo = Math.min(0, ...finite);
  let hi = Math.max(0, ...finite);
  if (hi === lo) hi = lo + 1;
  const step = niceStep(hi - lo, 5);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const n = Math.max(1, series.length - 1);
  const x = (i) => m.left + (i / n) * w;
  const y = (v) => m.top + (1 - (v - lo) / (hi - lo)) * h;
  const kids = [];
  for (let v = lo; v <= hi + step / 2; v += step) {
    kids.push(svgEl('line', { class: 'chart-grid', x1: m.left, x2: m.left + w, y1: y(v), y2: y(v) }));
    kids.push(svgEl('text', { class: 'chart-tick', x: m.left - 8, y: y(v) + 4, 'text-anchor': 'end' }, moneyShort(v)));
  }
  const xStep = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 56))));
  for (let i = 0; i <= n; i += xStep) {
    kids.push(svgEl('text', { class: 'chart-tick', x: x(i), y: m.top + h + 16, 'text-anchor': 'middle' }, String(i)));
  }
  kids.push(svgEl('line', { class: 'chart-zero', 'data-mark': 'zero', x1: m.left, x2: m.left + w, y1: y(0), y2: y(0) }));
  const d = series.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(Number.isFinite(v) ? v : 0).toFixed(1)).join(' ');
  kids.push(svgEl('path', { class: 'chart-line', 'data-series': 'net', d }));
  const pay = opts.paybackMonth;
  if (pay !== null && pay !== undefined && series[pay] !== undefined) {
    kids.push(svgEl('line', { class: 'chart-payback-rule', x1: x(pay), x2: x(pay), y1: m.top, y2: m.top + h }));
    const dot = svgEl('circle', { class: 'chart-payback-dot', 'data-mark': 'payback', cx: x(pay), cy: y(series[pay]), r: 5 });
    dot.append(svgEl('title', {}, t('paybackIn', { month: pay })));
    kids.push(dot);
    const right = x(pay) > m.left + w * 0.8;
    kids.push(svgEl('text', { class: 'chart-payback-label', x: x(pay) + (right ? -10 : 10), y: Math.min(m.top + h - 6, y(series[pay]) + 20), 'text-anchor': right ? 'end' : 'start' }, t('chartPayback')));
  }
  series.forEach((v, i) => {
    const hit = svgEl('circle', { class: 'chart-hit', cx: x(i), cy: y(Number.isFinite(v) ? v : 0), r: Math.max(4, Math.min(10, w / n / 2)) });
    hit.append(svgEl('title', {}, t('chartPoint', { month: i, value: money(v) })));
    kids.push(hit);
  });
  kids.push(svgEl('text', { class: 'chart-axis', 'data-axis': 'x', x: m.left + w / 2, y: height - 6, 'text-anchor': 'middle' }, t('axisMonth')));
  kids.push(svgEl('text', { class: 'chart-axis', 'data-axis': 'y', x: 0, y: 12, 'text-anchor': 'start' }, t('axisNet')));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.replaceChildren(...kids);
  if (host && !svg.resizeObserver && typeof ResizeObserver !== 'undefined') {
    let lastWidth = host.clientWidth;
    svg.resizeObserver = new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - lastWidth) < 2) return;
      lastWidth = host.clientWidth;
      renderLineChart(svg, svg.chartArgs.series, svg.chartArgs.opts);
    });
    svg.resizeObserver.observe(host);
  }
}

// ─── Verify ───
function roiPanelChecks(node, horizon) {
  const ds = node.dataset;
  const isNum = (v) => v !== '' && v !== undefined && Number.isFinite(Number(v));
  const pay = ds.paybackMonth;
  return [
    { name: 'ROI: numeric money attributes', pass: ['benefitMonthly', 'costMonthly', 'netMonthly'].every((k) => isNum(ds[k])), detail: `${ds.benefitMonthly} / ${ds.costMonthly} / ${ds.netMonthly}` },
    { name: 'ROI: roi-pct numeric or empty', pass: ds.roiPct === '' || isNum(ds.roiPct), detail: ds.roiPct },
    { name: 'ROI: payback empty or integer in [0, horizon]', pass: pay === '' || (/^\d+$/.test(pay) && Number(pay) <= horizon), detail: pay },
    { name: 'ROI: series length = horizon + 1', pass: ds.seriesLength === String(horizon + 1), detail: ds.seriesLength },
    { name: 'ROI: chart path finite', pass: [...node.querySelectorAll('svg path')].every((p) => !/NaN|Infinity/.test(p.getAttribute('d'))) },
  ];
}
function runChecks(checks) {
  const panel = $('checksPanel');
  if (!panel) return null;
  const passed = checks.filter((c) => c.pass).length;
  const summary = el('summary', { 'data-t': 'checksTitle' });
  const status = el('p', { id: 'checksStatus', role: 'status' }, t('checksResult', { passed, total: checks.length }));
  const list = el('ul', { id: 'checksResults' });
  list.append(...checks.map((c) => el('li', { 'data-check': c.name, 'data-pass': String(Boolean(c.pass)) }, `${c.pass ? '✓' : '✗'} ${c.name}${c.detail !== undefined && c.detail !== '' ? ': ' + c.detail : ''}`)));
  panel.replaceChildren(summary, status, list);
  Object.assign(panel.dataset, { passed: String(passed), total: String(checks.length), state: passed === checks.length && checks.length > 0 ? 'pass' : 'fail' });
  panel.hidden = false;
  panel.open = true;
  applyI18n(panel);
  return { passed, total: checks.length };
}

// ─── Exports ───
globalThis.SubUI = {
  T, LS_LANG, NAV_PAGES, t, addStrings, getLang, setLang, onLangChange, onReset, applyI18n,
  money, moneyShort, fmtNum, plural, dataNum, el, svgEl, announce, isVerify,
  bindFields, fillSelect, persist, restore,
  renderNav, setDrawer, renderRoiPanel, renderLineChart, roiPanelChecks, runChecks,
};
})();
