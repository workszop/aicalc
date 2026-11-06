// "Ceny modeli" panel shared by index.html, seats.html and agent.html. Classic script: load after sub/prices.js.
// Exposes globalThis.PriceUI. Nothing touches the DOM at load time. Fetched names and ids are untrusted text:
// the panel is built with createElement / textContent only.
(function () {
// ─── Constants ───
// Whole update (list + every creator endpoint); each request also has its own limit.
const TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 10000;
const STRINGS = {
  pl: {
    ppBtn: 'Ceny modeli', ppUpdateBtn: 'Aktualizuj z OpenRouter', ppTitle: 'Ceny modeli', ppClose: 'Zamknij',
    ppBuiltin: 'Ceny wbudowane, sprawdzone {date}', ppUpdated: 'Zaktualizowane z OpenRouter {date}',
    ppIntro: 'Ceny pochodzą od twórcy modelu (np. DeepSeek, OpenAI, Anthropic), pobrane przez OpenRouter. Każdą zmianę zatwierdzasz sam. Ceny dla długiego kontekstu i poza szczytem nie są aktualizowane.',
    ppFetch: 'Pobierz aktualne ceny', ppRestore: 'Przywróć ceny wbudowane',
    ppLoading: 'Pobieram ceny z OpenRouter…', ppError: 'Nie udało się pobrać cen z OpenRouter. Spróbuj później.',
    ppProgress: 'Pobieranie cen twórców: {done}/{total}',
    ppReady: 'Zmiany cen: {changes} · nowe modele: {new} · brak w OpenRouter: {missing} · brak ceny twórcy: {noCreator}.',
    ppChanges: 'Zmiany cen', ppNoChanges: 'Ceny są aktualne.', ppMissing: 'Brak w OpenRouter',
    ppNoCreator: 'Brak ceny twórcy w OpenRouter', ppNoCreatorHint: 'Te modele zachowują dotychczasowe ceny.',
    ppNoTokenizer: 'Brak współczynnika tokenizera tej rodziny – dodanie po pomiarze',
    ppNew: 'Nowe modele', ppNewHint: 'Nowe modele nie są zaznaczone. Sprawdź cenę u dostawcy, zanim je dodasz.',
    ppBigHint: 'Zmiany oznaczone jako duże nie są zaznaczone.',
    ppApply: 'Zastosuj zaznaczone', ppCancel: 'Anuluj',
    ppApplied: 'Zastosowano zaznaczone zmiany: {n}.', ppNothing: 'Nic nie zaznaczono.', ppRestored: 'Przywrócono ceny wbudowane.',
    ppStoreFail: 'Przeglądarka nie pozwala zapisać zmian, więc działają tylko do zamknięcia strony.',
    ppThPick: 'wybór', ppThModel: 'model', ppThField: 'pole', ppThOldNew: 'było → jest', ppThPct: 'zmiana', ppThFlags: 'uwagi',
    ppThIn: 'wejście USD/1M', ppThOut: 'wyjście USD/1M', ppThCtx: 'kontekst',
    ppFieldPin: 'cena wejścia (USD/1M)', ppFieldPout: 'cena wyjścia (USD/1M)', ppFieldCtx: 'okno kontekstu', ppFieldMaxOutput: 'maks. odpowiedź (tokeny)',
    ppFlagBig: 'duża zmiana, sprawdź u dostawcy', ppFlagTiers: 'ceny dla długiego kontekstu nie są aktualizowane',
    ppNewPrice: 'nowa cena', ppPickChange: 'Zastosuj: {model}, {field}', ppPickNew: 'Dodaj model {model}',
  },
  en: {
    ppBtn: 'Model prices', ppUpdateBtn: 'Update from OpenRouter', ppTitle: 'Model prices', ppClose: 'Close',
    ppBuiltin: 'Built-in prices, checked {date}', ppUpdated: 'Updated from OpenRouter {date}',
    ppIntro: 'Prices come from the model\'s creator (e.g. DeepSeek, OpenAI, Anthropic), fetched through OpenRouter. You approve every change yourself. Long-context and off-peak prices are not updated.',
    ppFetch: 'Fetch current prices', ppRestore: 'Restore built-in prices',
    ppLoading: 'Fetching prices from OpenRouter…', ppError: 'Could not fetch prices from OpenRouter. Try again later.',
    ppProgress: 'Fetching creator prices: {done}/{total}',
    ppReady: 'Price changes: {changes} · new models: {new} · missing from OpenRouter: {missing} · no creator price: {noCreator}.',
    ppChanges: 'Price changes', ppNoChanges: 'Prices are up to date.', ppMissing: 'Missing from OpenRouter',
    ppNoCreator: 'No creator price on OpenRouter', ppNoCreatorHint: 'These models keep their current prices.',
    ppNoTokenizer: 'No tokenizer factor for this family yet – can be added after measurement',
    ppNew: 'New models', ppNewHint: 'New models are not selected. Check the price with the provider before adding them.',
    ppBigHint: 'Changes flagged as large are not selected.',
    ppApply: 'Apply selected', ppCancel: 'Cancel',
    ppApplied: 'Selected changes applied: {n}.', ppNothing: 'Nothing is selected.', ppRestored: 'Built-in prices restored.',
    ppStoreFail: 'The browser does not allow saving the changes, so they last only until the page is closed.',
    ppThPick: 'pick', ppThModel: 'model', ppThField: 'field', ppThOldNew: 'old → new', ppThPct: 'change', ppThFlags: 'notes',
    ppThIn: 'input USD/1M', ppThOut: 'output USD/1M', ppThCtx: 'context',
    ppFieldPin: 'input price (USD/1M)', ppFieldPout: 'output price (USD/1M)', ppFieldCtx: 'context window', ppFieldMaxOutput: 'max. output (tokens)',
    ppFlagBig: 'large change, check with the provider', ppFlagTiers: 'long-context prices are not updated',
    ppNewPrice: 'new price', ppPickChange: 'Apply: {model}, {field}', ppPickNew: 'Add model {model}',
  },
};
const FIELD_KEY = { pin: 'ppFieldPin', pout: 'ppFieldPout', ctx: 'ppFieldCtx', maxOutput: 'ppFieldMaxOutput' };
const FLAG_KEY = { big: 'ppFlagBig', tiersKept: 'ppFlagTiers' };
const SAFE_PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9_\-./]*$/;

// ─── Helpers ───
const PS = () => globalThis.PriceSync;
function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}
function loadStore() {
  let text = null;
  try { text = localStorage.getItem(PS().STORE_KEY); } catch (_) { return null; }
  if (text === null) return null;
  try { return PS().parseStore(text); } catch (_) {
    try { localStorage.removeItem(PS().STORE_KEY); } catch (_e) {}
    return null;
  }
}
function saveStore(store) { try { localStorage.setItem(PS().STORE_KEY, JSON.stringify(store)); return true; } catch (_) { return false; } }
function clearStore() { try { localStorage.removeItem(PS().STORE_KEY); } catch (_) {} }
// Test hook: ?pricesUrl= is accepted only for a same-origin relative path.
function feedUrl() {
  const raw = new URLSearchParams(location.search).get('pricesUrl');
  if (!raw || !SAFE_PATH_RE.test(raw) || raw.includes('..') || raw.includes('//')) return PS().FEED_URL;
  try {
    const u = new URL(raw, location.href);
    return u.origin === location.origin ? u.href : PS().FEED_URL;
  } catch (_) { return PS().FEED_URL; }
}
// A model's endpoints: the OpenRouter API, or <dir of the test feed>/endpoints/<id with / as __>.json.
function endpointsUrl(id, feed) {
  return feed === PS().FEED_URL ? PS().endpointsUrl(id) : new URL('endpoints/' + PS().endpointsFile(id), feed).href;
}
// One request, aborted by its own timeout or by the whole update's signal.
async function fetchJson(url, budget) {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  const timer = setTimeout(stop, REQUEST_TIMEOUT_MS);
  if (budget.aborted) stop(); else budget.addEventListener('abort', stop);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' }, credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); budget.removeEventListener('abort', stop); }
}
function oldestDate(models) {
  return models.map((m) => m.checkedAt).filter(Boolean).sort()[0] || '';
}

// ─── Panel ───
// opts: { trigger, t(key, vars), lang() -> 'pl'|'en', getModels(), onApply(nextModels), onRestore(), statusEl? }
function mount(opts) {
  const t = opts.t;
  const view = { state: 'idle', rows: [], missing: [], noCreator: [], candidates: [], message: '' };
  const clearView = () => { view.rows = []; view.missing = []; view.noCreator = []; view.candidates = []; };
  const fmt = (v) => new Intl.NumberFormat(opts.lang() === 'pl' ? 'pl-PL' : 'en-GB', { maximumFractionDigits: 6 }).format(v);

  // ─── DOM ───
  const dialog = el('dialog', { id: 'pricePanel', class: 'price-panel', 'aria-labelledby': 'pricePanelTitle', 'data-state': 'idle', 'data-changes': '0', 'data-new': '0', 'data-missing': '0', 'data-no-creator': '0', 'data-progress': '' });
  const title = el('h2', { id: 'pricePanelTitle' });
  const closeBtn = el('button', { type: 'button', class: 'ghost-btn', id: 'priceClose' });
  const head = el('div', { class: 'pp-head' });
  head.append(title, closeBtn);
  const status = el('p', { class: 'pp-status', id: 'priceStatus' });
  const intro = el('p', { class: 'hint pp-intro' });
  const fetchBtn = el('button', { type: 'button', class: 'pp-btn', id: 'priceFetch' });
  const restoreBtn = el('button', { type: 'button', class: 'ghost-btn', id: 'priceRestore' });
  const progress = el('progress', { id: 'priceProgress', hidden: '' });
  const actions = el('div', { class: 'pp-actions' });
  actions.append(fetchBtn, restoreBtn, progress);
  const msg = el('p', { class: 'pp-msg', id: 'priceMsg', role: 'status', 'aria-live': 'polite' });
  const results = el('div', { class: 'pp-results', id: 'priceResults' });
  const applyBtn = el('button', { type: 'button', class: 'pp-btn', id: 'priceApply' });
  const cancelBtn = el('button', { type: 'button', class: 'ghost-btn', id: 'priceCancel' });
  const foot = el('div', { class: 'pp-foot', hidden: '' });
  foot.append(applyBtn, cancelBtn);
  const body = el('div', { class: 'pp-body' });
  body.append(status, intro, actions, msg, results);
  dialog.append(head, body, foot);
  document.body.append(dialog);

  // ─── Render ───
  function setState(next) {
    view.state = next;
    dialog.dataset.state = next;
    dialog.setAttribute('aria-busy', String(next === 'loading'));
  }
  function renderStatus() {
    const store = loadStore();
    const text = store ? t('ppUpdated', { date: store.updatedAt.slice(0, 10) }) : t('ppBuiltin', { date: oldestDate(opts.getModels()) });
    status.textContent = text;
    if (opts.statusEl) opts.statusEl.textContent = text;
    document.body.dataset.prices = store ? 'openrouter' : 'builtin';
    restoreBtn.disabled = !store;
  }
  function th(text) { return el('th', { scope: 'col' }, text); }
  function table(headCells, rows) {
    const wrap = el('div', { class: 'pp-wrap', tabindex: '0', role: 'region' });
    const tbl = el('table', { class: 'pp-tbl' });
    const thead = el('thead');
    const tr = el('tr');
    headCells.forEach((c) => tr.append(th(c)));
    thead.append(tr);
    const tbody = el('tbody');
    rows.forEach((r) => tbody.append(r));
    tbl.append(thead, tbody);
    wrap.append(tbl);
    return wrap;
  }
  function checkCell(attrs, label, checked) {
    const td = el('td', { class: 'pick' });
    const box = el('input', Object.assign({ type: 'checkbox', 'aria-label': label }, attrs));
    box.checked = checked;
    td.append(box);
    return td;
  }
  function section(id, heading) {
    const s = el('section', { class: 'pp-section', id, 'aria-labelledby': id + 'Title' });
    s.append(el('h3', { id: id + 'Title' }, heading));
    return s;
  }
  function renderResults() {
    results.replaceChildren();
    Object.assign(dialog.dataset, { changes: String(view.rows.length), new: String(view.candidates.length), missing: String(view.missing.length), noCreator: String(view.noCreator.length) });
    foot.hidden = view.state !== 'ready';
    if (view.state !== 'ready') return;
    const changes = section('priceChanges', t('ppChanges'));
    if (!view.rows.length) changes.append(el('p', { class: 'pp-ok' }, t('ppNoChanges')));
    else {
      if (view.rows.some((r) => r.flags.includes('big'))) changes.append(el('p', { class: 'hint' }, t('ppBigHint')));
      changes.append(table([t('ppThPick'), t('ppThModel'), t('ppThField'), t('ppThOldNew'), t('ppThPct'), t('ppThFlags')], view.rows.map((r, i) => {
        const tr = el('tr', { 'data-model-id': r.id, 'data-field': r.field, 'data-flags': r.flags.join(' ') });
        const flags = el('td', { class: 'flags' });
        r.flags.forEach((f) => flags.append(el('span', { class: 'pp-badge', 'data-flag': f }, t(FLAG_KEY[f]))));
        const pctText = r.pctChange === null ? t('ppNewPrice') : (r.pctChange > 0 ? '+' : '') + fmt(Math.round(r.pctChange * 10) / 10) + '%';
        tr.append(checkCell({ 'data-change': String(i) }, t('ppPickChange', { model: r.name, field: t(FIELD_KEY[r.field]) }), r.checked),
          el('th', { scope: 'row' }, r.name), el('td', {}, t(FIELD_KEY[r.field])),
          el('td', { class: 'num' }, fmt(r.old) + ' → ' + fmt(r.next)), el('td', { class: 'num' }, pctText), flags);
        return tr;
      })));
    }
    results.append(changes);
    if (view.missing.length) {
      const s = section('priceMissing', t('ppMissing'));
      const ul = el('ul');
      view.missing.forEach((m) => ul.append(el('li', { 'data-model-id': m.id }, m.name + ' (' + m.openrouter + ')')));
      s.append(ul);
      results.append(s);
    }
    if (view.noCreator.length) {
      const s = section('priceNoCreator', t('ppNoCreator'));
      s.append(el('p', { class: 'hint' }, t('ppNoCreatorHint')));
      const ul = el('ul');
      view.noCreator.forEach((m) => ul.append(el('li', { 'data-model-id': m.id }, m.name + ' (' + m.openrouter + ')')));
      s.append(ul);
      results.append(s);
    }
    if (view.candidates.length) {
      const s = section('priceNew', t('ppNew'));
      s.append(el('p', { class: 'hint' }, t('ppNewHint')));
      s.append(table([t('ppThPick'), t('ppThModel'), t('ppThIn'), t('ppThOut'), t('ppThCtx'), t('ppThFlags')], view.candidates.map((c, i) => {
        const tr = el('tr', { 'data-openrouter': c.openrouter, 'data-can-add': String(c.canAdd) });
        const pick = checkCell({ 'data-candidate': String(i) }, t('ppPickNew', { model: c.name }), c.checked);
        const notes = el('td', { class: 'flags' });
        if (!c.canAdd) {
          pick.querySelector('input').disabled = true;
          notes.append(el('span', { class: 'pp-badge', 'data-flag': 'noTokenizer' }, t('ppNoTokenizer')));
        }
        tr.append(pick, el('th', { scope: 'row' }, c.name), el('td', { class: 'num' }, fmt(c.pin)), el('td', { class: 'num' }, fmt(c.pout)), el('td', { class: 'num' }, fmt(c.ctx)), notes);
        return tr;
      })));
      results.append(s);
    }
    syncApply();
  }
  function syncApply() {
    applyBtn.disabled = !view.rows.some((r) => r.checked) && !view.candidates.some((c) => c.checked && c.canAdd);
  }
  function refresh() {
    title.textContent = t('ppTitle');
    closeBtn.textContent = t('ppClose');
    intro.textContent = t('ppIntro');
    fetchBtn.textContent = t('ppFetch');
    restoreBtn.textContent = t('ppRestore');
    applyBtn.textContent = t('ppApply');
    cancelBtn.textContent = t('ppCancel');
    progress.setAttribute('aria-label', t('ppLoading'));
    if (view.message) msg.textContent = t(view.message.key, view.message.vars);
    renderStatus();
    renderResults();
  }
  function say(key, vars) {
    view.message = { key, vars };
    msg.textContent = t(key, vars);
  }
  // Progress counter: visible text only. aria-busy keeps screen readers from reading every step;
  // they hear the start and the result.
  function sayProgress(key, vars) {
    msg.setAttribute('aria-busy', 'true');
    say(key, vars);
  }

  // ─── Actions ───
  async function load() {
    if (view.state === 'loading') return;
    setState('loading');
    clearView();
    renderResults();
    fetchBtn.disabled = true;
    progress.hidden = false;
    progress.removeAttribute('value');
    dialog.dataset.progress = '';
    say('ppLoading');
    const budget = new AbortController();
    const timer = setTimeout(() => budget.abort(), TIMEOUT_MS);
    const feed = feedUrl();
    const io = { list: () => fetchJson(feed, budget.signal), endpoints: (id) => fetchJson(endpointsUrl(id, feed), budget.signal) };
    const onProgress = (done, total) => {
      dialog.dataset.progress = done + '/' + total;
      progress.max = Math.max(total, 1);
      progress.value = done;
      sayProgress('ppProgress', { done, total });
    };
    try {
      const models = opts.getModels();
      const update = PS().creatorUpdate(models, await PS().fetchCreatorData(models, io, { onProgress }));
      view.rows = update.rows.map((r) => Object.assign(r, { checked: !r.flags.includes('big') }));
      view.missing = update.missing;
      view.noCreator = update.noCreator;
      view.candidates = update.candidates.map((c) => Object.assign(c, { checked: false }));
      msg.removeAttribute('aria-busy');
      setState('ready');
      say('ppReady', { changes: view.rows.length, new: view.candidates.length, missing: view.missing.length, noCreator: view.noCreator.length });
    } catch (_) {
      msg.removeAttribute('aria-busy');
      setState('error');
      say('ppError');
    } finally {
      clearTimeout(timer);
      fetchBtn.disabled = false;
      progress.hidden = true;
      renderResults();
    }
  }
  function apply() {
    const changes = view.rows.filter((r) => r.checked);
    const added = view.candidates.filter((c) => c.checked && c.canAdd);
    if (!changes.length && !added.length) { say('ppNothing'); return; }
    const saved = saveStore(PS().overridesFrom(loadStore(), { changes, added }));
    opts.onApply(PS().applyUpdate(opts.getModels(), { changes, added }));
    clearView();
    setState('applied');
    renderStatus();
    renderResults();
    say(saved ? 'ppApplied' : 'ppStoreFail', { n: changes.length + added.length });
    if (saved) document.body.dataset.prices = 'openrouter';
  }
  function restore() {
    clearStore();
    opts.onRestore();
    clearView();
    setState('idle');
    renderStatus();
    renderResults();
    say('ppRestored');
  }
  function open() {
    if (!dialog.open) dialog.showModal();
    fetchBtn.focus();
  }
  function close() { if (dialog.open) dialog.close(); opts.trigger.focus(); }

  // ─── Listeners ───
  opts.trigger.setAttribute('aria-haspopup', 'dialog');
  opts.trigger.setAttribute('aria-controls', 'pricePanel');
  opts.trigger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', () => {
    clearView();
    if (view.state === 'ready') setState('idle');
    renderResults();
    close();
  });
  fetchBtn.addEventListener('click', load);
  restoreBtn.addEventListener('click', restore);
  applyBtn.addEventListener('click', apply);
  results.addEventListener('change', (e) => {
    const box = e.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.dataset.change !== undefined) view.rows[Number(box.dataset.change)].checked = box.checked;
    if (box.dataset.candidate !== undefined) { const c = view.candidates[Number(box.dataset.candidate)]; c.checked = c.canAdd && box.checked; box.checked = c.checked; }
    syncApply();
  });
  // Page shortcuts (L, 1-3, Alt+R) must not fire behind the modal; Esc closes it natively.
  dialog.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('close', () => opts.trigger.focus());

  refresh();
  return { refresh, open, close, load, dialog };
}

// Sub pages: a header button next to Resetuj; the page's SubCore.MODELS array is swapped in place,
// so every module that destructured MODELS sees the new list.
function mountSubPage(o) {
  const UI = globalThis.SubUI;
  const trigger = el('button', { type: 'button', class: 'ghost-btn', id: 'pricesBtn', 'data-t': 'ppBtn' }, UI.t('ppBtn'));
  document.getElementById('resetBtn').after(trigger);
  const swap = (next) => {
    o.models.splice(0, o.models.length, ...next);
    UI.fillSelect(o.modelSelect, o.models.map((m) => ({ value: m.name, label: m.name })));
    if (!o.models.some((m) => m.name === o.state.model)) o.state.model = o.defaultModel;
    o.sync();
    o.onChange();
  };
  const ui = mount({
    trigger, t: UI.t, lang: UI.getLang, getModels: () => o.models,
    onApply: swap, onRestore: () => swap(o.builtin.map((m) => Object.assign({}, m))),
  });
  UI.onLangChange(ui.refresh);
  return ui;
}

// ─── Exports ───
globalThis.PriceUI = { STRINGS, TIMEOUT_MS, REQUEST_TIMEOUT_MS, loadStore, saveStore, clearStore, feedUrl, mount, mountSubPage };
})();
