// Pure, DOM-free model price update from OpenRouter. Classic script: works in the browser
// (globalThis.PriceSync), in node (module.exports) and in scripts/update-prices.mjs.
// The model list (/api/v1/models) is used to discover models; prices, context and max output come from the
// model creator's own endpoint (/api/v1/models/{id}/endpoints, tag = CREATOR_TAG), never from another host.
(function () {
// ─── Constants ───
const FEED_URL = 'https://openrouter.ai/api/v1/models';
// Exact endpoint tag of the model's creator. Tag variants (openai/flex, openai/fast, alibaba/us-east-1) are other tiers.
const CREATOR_TAG = { openai: 'openai', anthropic: 'anthropic', deepseek: 'deepseek', qwen: 'alibaba', google: 'google-ai-studio' };
const CONCURRENCY = 4;
const STORE_KEY = 'edulab-aicalc-prices-v1';
const STORE_VERSION = 1;
const BIG_CHANGE = 0.30;
const EPSILON = 1e-9;
const FIELDS = ['pin', 'pout', 'ctx', 'maxOutput'];
const PRICE_FIELDS = ['pin', 'pout'];
const FAMILY_BY_PROVIDER = { openai: 'openai', anthropic: 'claudeNew', deepseek: 'deepseek', qwen: 'qwen', google: 'gemini' };
const PROVIDER_LABEL = { openai: 'OpenAI', anthropic: 'Anthropic', deepseek: 'DeepSeek', qwen: 'Qwen', google: 'Google' };
const KNOWN_FAMILIES = ['openai', 'deepseek', 'qwen', 'claude', 'claudeNew'];
const SKIP_PATTERNS = ['-image', '-vl-', 'guard', '-pro', 'preview'];
// New-model candidates per provider (qwen has a tokenizer family, but no candidates). `gemini` has no
// tokenizer factor yet, so a Google candidate is listed but cannot be added (KNOWN_FAMILIES has no gemini).
const OPENAI_TIER_RE = /(^|[-.])(luna|terra|sol)($|[-.])/;
const DEEPSEEK_EXP_RE = /-exp|vision|experimental/;
const GOOGLE_FLASH_RE = /^google\/gemini-[\d.]+-flash$/;
const CANDIDATE_RULES = {
  openai: (orId, id) => OPENAI_TIER_RE.test(id),
  anthropic: () => true,
  deepseek: (orId, id, mapped) => !DEEPSEEK_EXP_RE.test(id) && ![...mapped].some((m) => m.replace(/-\d+$/, '') === orId),
  google: (orId) => GOOGLE_FLASH_RE.test(orId),
};
const NOTE_UPDATED = 'Cena twórcy modelu (z OpenRouter).';
const NOTE_ADDED = 'Cena twórcy modelu (z OpenRouter).';
const MAX_STORE_ITEMS = 100;
const MAX_NUMBER = 1e9;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const OR_ID_RE = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// index.html CSV columns for the fields this module writes.
const CSV_COLUMNS = { pin: 'cena_wejscie_per_1M_USD', pout: 'cena_wyjscie_per_1M_USD', ctx: 'okno_kontekstu', maxOutput: 'max_output', checkedAt: 'checked_at', note: 'uwaga' };

// ─── Helpers ───
const today = () => new Date().toISOString().slice(0, 10);
const round6 = (v) => Number(Number(v).toPrecision(6));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fail = (msg) => { throw new Error('OpenRouter: ' + msg); };
// Untrusted feed text: no control characters, collapsed spaces, bounded length.
function cleanText(v, max = 120) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
const hasTiers = (m) => Boolean(m.tier) || (m.tierAbove !== undefined && m.tierAbove !== null);
const isPosInt = (v) => Number.isInteger(v) && v > 0 && v <= MAX_NUMBER;
const isPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_NUMBER;
const skipId = (id) => id.startsWith('~') || id.endsWith(':batch');
const providerOf = (orId) => String(orId).slice(0, String(orId).indexOf('/'));
// Where a model's endpoint list lives: the OpenRouter API, or a file name in a fixture directory.
const endpointsUrl = (orId) => FEED_URL + '/' + orId.split('/').map(encodeURIComponent).join('/') + '/endpoints';
const endpointsFile = (orId) => orId.replace(/\//g, '__') + '.json';

// ─── Feed ───
// Map(openrouterId -> { pin, pout, ctx, maxOutput, name, created }); prices in USD per 1M tokens.
function parseOpenRouter(json) {
  if (!isObj(json) || !Array.isArray(json.data)) fail('expected { data: [...] }');
  const out = new Map();
  json.data.forEach((e, i) => {
    if (!isObj(e) || typeof e.id !== 'string' || !e.id) fail(`entry ${i} has no id`);
    if (!isObj(e.pricing)) fail(`entry ${e.id} has no pricing object`);
    if (skipId(e.id)) return;
    const pin = Number(e.pricing.prompt);
    const pout = Number(e.pricing.completion);
    // Routers with variable prices publish -1; they are not models with a price.
    if (!Number.isFinite(pin) || !Number.isFinite(pout) || pin < 0 || pout < 0) return;
    const ctx = Number(e.context_length);
    const top = isObj(e.top_provider) ? e.top_provider : {};
    const maxRaw = Number(top.max_completion_tokens);
    out.set(e.id, {
      pin: round6(pin * 1e6),
      pout: round6(pout * 1e6),
      ctx: isPosInt(ctx) ? ctx : null,
      maxOutput: isPosInt(maxRaw) ? maxRaw : null,
      name: cleanText(e.name),
      created: Number.isFinite(Number(e.created)) ? Number(e.created) : 0,
    });
  });
  return out;
}

// ─── Creator endpoint ───
// { pin, pout, ctx, maxOutput, provider, tag } from the endpoint whose tag is exactly the creator tag, or null
// (unknown provider, no such endpoint, malformed answer, an answer for another model).
function creatorEndpoint(openrouterId, endpointsJson) {
  const tag = CREATOR_TAG[providerOf(openrouterId)];
  if (!tag || !isObj(endpointsJson) || !isObj(endpointsJson.data)) return null;
  const data = endpointsJson.data;
  if (typeof data.id === 'string' && data.id !== openrouterId) return null;
  if (!Array.isArray(data.endpoints)) return null;
  const e = data.endpoints.find((x) => isObj(x) && x.tag === tag);
  if (!e || !isObj(e.pricing)) return null;
  const pin = Number(e.pricing.prompt);
  const pout = Number(e.pricing.completion);
  if (!Number.isFinite(pin) || !Number.isFinite(pout) || pin < 0 || pout < 0) return null;
  const ctx = isPosInt(Number(e.context_length)) ? Number(e.context_length) : null;
  const maxRaw = Number(e.max_completion_tokens);
  return {
    pin: round6(pin * 1e6), pout: round6(pout * 1e6), ctx,
    maxOutput: isPosInt(maxRaw) ? maxRaw : ctx,
    provider: cleanText(e.provider_name), tag,
  };
}
// endpointsById: Map or object { openrouterId: endpoints JSON | null }. Returns the Map diffModels consumes;
// a model without a creator endpoint is left out, so diffModels reports it as missing.
function creatorMap(endpointsById) {
  const out = new Map();
  const entries = endpointsById instanceof Map ? [...endpointsById] : Object.entries(endpointsById || {});
  entries.forEach(([id, json]) => {
    const c = creatorEndpoint(id, json);
    if (c) out.set(id, c);
  });
  return out;
}

// ─── Diff ───
function relDiff(a, b) {
  if (a === b) return 0;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? 0 : Math.abs(a - b) / scale;
}
// Rows { id, name, openrouter, field, old, next, pctChange, flags } plus { id, name, openrouter, missing: true }.
function diffModels(models, orMap) {
  const out = [];
  models.forEach((m) => {
    if (!m.openrouter) return;
    const feed = orMap.get(m.openrouter);
    if (!feed) { out.push({ id: m.id, name: m.name, openrouter: m.openrouter, missing: true }); return; }
    const rows = [];
    FIELDS.forEach((field) => {
      const next = feed[field];
      const old = m[field];
      if (next === null || next === undefined || typeof old !== 'number') return;
      if (relDiff(old, next) < EPSILON) return;
      const pctChange = old === 0 ? null : (next - old) / old * 100;
      const flags = [];
      // Any field (price, context, max output) that moves by more than BIG_CHANGE needs a look at the provider.
      if (pctChange === null || Math.abs(pctChange) > BIG_CHANGE * 100) flags.push('big');
      if (PRICE_FIELDS.includes(field) && hasTiers(m)) flags.push('tiersKept');
      rows.push({ id: m.id, name: m.name, openrouter: m.openrouter, field, old, next, pctChange, flags });
    });
    // Safety net: prices come from the creator's endpoint, so a big price jump is rare and makes the whole
    // entry doubtful (a wrong mapping, a new tier): flag every change of that model.
    if (rows.some((r) => PRICE_FIELDS.includes(r.field) && r.flags.includes('big'))) rows.forEach((r) => { if (!r.flags.includes('big')) r.flags.unshift('big'); });
    out.push(...rows);
  });
  return out;
}

// ─── New models ───
function ourName(provider, raw) {
  const label = PROVIDER_LABEL[provider];
  const rest = cleanText(raw).replace(/^[^:]{1,40}:\s*/, '');
  if (!rest) return '';
  return rest.toLowerCase().startsWith(label.toLowerCase()) ? rest : label + ' ' + rest;
}
// A model as both pages need it: index fields (cls, note, tier, offPeak) and core fields (tierAbove...).
function cleanModel(m) {
  return {
    id: m.id, name: m.name, openrouter: m.openrouter || '', family: m.family, cls: m.cls || 'standard',
    alwaysThinks: Boolean(m.alwaysThinks), pin: m.pin, pout: m.pout, ctx: m.ctx, maxOutput: m.maxOutput,
    tier: null, offPeak: null, tierAbove: null, tierIn: null, tierOut: null,
    checkedAt: m.checkedAt, source: m.source, note: m.note,
  };
}
// Discovery from the list feed: up to `limit` new models, newest first (ids, names, created only).
function discover(models, map, limit) {
  const mapped = new Set(models.map((m) => m.openrouter).filter(Boolean));
  const ids = new Set(models.map((m) => String(m.id).toLowerCase()));
  const out = [];
  map.forEach((f, orId) => {
    const slash = orId.indexOf('/');
    const provider = orId.slice(0, slash);
    const id = orId.slice(slash + 1);
    if (!CANDIDATE_RULES[provider] || mapped.has(orId) || !OR_ID_RE.test(orId)) return;
    if (SKIP_PATTERNS.some((p) => orId.includes(p)) || !CANDIDATE_RULES[provider](orId, id, mapped)) return;
    if (!ID_RE.test(id) || ids.has(id.toLowerCase()) || f.ctx === null) return;
    out.push({ orId, provider, id, name: f.name, created: f.created });
  });
  out.sort((a, b) => b.created - a.created);
  return out.slice(0, limit);
}
// OpenRouter ids whose endpoints are worth fetching: mapped models that are on the list, then the candidates.
function creatorIds(models, json, limit = 15) {
  const map = parseOpenRouter(json);
  const mapped = models.map((m) => m.openrouter).filter((id) => id && OR_ID_RE.test(id) && map.has(id));
  return [...new Set(mapped.concat(discover(models, map, limit).map((c) => c.orId)))];
}
// creators: creatorMap(...). A candidate without a creator endpoint (or its context) is dropped.
// canAdd is false for a family without a tokenizer factor (gemini): listed, never added.
function newModelCandidates(models, json, creators, limit = 15, day = today()) {
  const map = parseOpenRouter(json);
  const names = new Set(models.map((m) => String(m.name).toLowerCase()));
  const out = [];
  discover(models, map, limit).forEach((d) => {
    const c = creators && creators.get(d.orId);
    if (!c || c.ctx === null) return;
    let name = ourName(d.provider, d.name) || PROVIDER_LABEL[d.provider] + ' ' + d.id;
    if (names.has(name.toLowerCase())) name += ' (OpenRouter)';
    out.push(Object.assign(cleanModel({
      id: d.id, name, openrouter: d.orId, family: FAMILY_BY_PROVIDER[d.provider], cls: 'standard', alwaysThinks: false,
      pin: c.pin, pout: c.pout, ctx: c.ctx, maxOutput: c.maxOutput,
      checkedAt: day, source: 'https://openrouter.ai/' + d.orId + '/providers', note: NOTE_ADDED,
    }), { created: d.created, canAdd: KNOWN_FAMILIES.includes(FAMILY_BY_PROVIDER[d.provider]) }));
  });
  return out;
}

// ─── Fetch (I/O injected) ───
// io: { list() -> Promise<list JSON>, endpoints(openrouterId) -> Promise<endpoints JSON> }.
// The list failing is a total failure (throws). An endpoints request failing only leaves that model
// without a creator price. At most `concurrency` endpoints requests are in flight; onProgress(done, total).
async function fetchCreatorData(models, io, { limit = 15, concurrency = CONCURRENCY, onProgress } = {}) {
  const list = await io.list();
  const listMap = parseOpenRouter(list);
  const ids = creatorIds(models, list, limit);
  const endpoints = new Map();
  let next = 0;
  let done = 0;
  if (onProgress) onProgress(0, ids.length);
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      let json = null;
      try { json = await io.endpoints(id); } catch (_) { json = null; }
      endpoints.set(id, json);
      done += 1;
      if (onProgress) onProgress(done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, ids.length)) }, worker));
  return { list, listMap, endpoints, ids };
}
// rows: diff rows; missing: mapped ids absent from the list; noCreator: on the list, but no creator endpoint
// (or its request failed); candidates: new models priced from their creator endpoint.
function creatorUpdate(models, data, limit = 15, day = today()) {
  const creators = creatorMap(data.endpoints);
  const diff = diffModels(models, creators);
  const gone = diff.filter((r) => r.missing);
  return {
    rows: diff.filter((r) => !r.missing),
    missing: gone.filter((r) => !data.listMap.has(r.openrouter)),
    noCreator: gone.filter((r) => data.listMap.has(r.openrouter)).map((r) => ({ id: r.id, name: r.name, openrouter: r.openrouter, noCreator: true })),
    candidates: newModelCandidates(models, data.list, creators, limit, day),
  };
}

// ─── Apply ───
// changes: accepted diff rows; added: candidate models. Returns a new array, the input is not touched.
function applyUpdate(models, update, day = today()) {
  const byId = {};
  ((update && update.changes) || []).forEach((r) => {
    if (!r || r.missing || !FIELDS.includes(r.field)) return;
    (byId[r.id] = byId[r.id] || {})[r.field] = r.next;
  });
  const out = models.map((m) => {
    const c = byId[m.id];
    return c ? Object.assign({}, m, c, { checkedAt: day, note: NOTE_UPDATED }) : Object.assign({}, m);
  });
  return appendAdded(out, (update && update.added) || []);
}
function appendAdded(list, added) {
  const ids = new Set(list.map((m) => String(m.id).toLowerCase()));
  const names = new Set(list.map((m) => String(m.name).toLowerCase()));
  added.forEach((a) => {
    if (!a || !KNOWN_FAMILIES.includes(a.family)) return;
    const id = String(a.id).toLowerCase();
    const name = String(a.name).toLowerCase();
    if (ids.has(id) || names.has(name)) return;
    ids.add(id); names.add(name);
    list.push(cleanModel(a));
  });
  return list;
}

// ─── Browser store ───
// { version: 1, updatedAt, changes: { id: { pin?, pout?, ctx?, maxOutput?, checkedAt } }, added: [model...] }
function overridesFrom(prev, update, updatedAt = new Date().toISOString()) {
  const day = String(updatedAt).slice(0, 10);
  const store = { version: STORE_VERSION, updatedAt, changes: {}, added: [] };
  if (prev && isObj(prev.changes)) Object.keys(prev.changes).forEach((id) => { store.changes[id] = Object.assign({}, prev.changes[id]); });
  if (prev && Array.isArray(prev.added)) store.added = prev.added.map(cleanModel);
  ((update && update.changes) || []).forEach((r) => {
    if (!r || r.missing || !FIELDS.includes(r.field)) return;
    const c = store.changes[r.id] = store.changes[r.id] || {};
    c[r.field] = r.next;
    c.checkedAt = day;
  });
  appendAdded(store.added, (update && update.added) || []);
  return store;
}
function checkModel(m) {
  if (!isObj(m)) throw new Error('store: added model is not an object');
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) throw new Error('store: bad id');
  if (typeof m.name !== 'string' || !m.name || m.name.length > 200) throw new Error('store: bad name');
  if (!KNOWN_FAMILIES.includes(m.family)) throw new Error('store: unknown family');
  if (!isPrice(m.pin) || !isPrice(m.pout) || !isPosInt(m.ctx) || !isPosInt(m.maxOutput)) throw new Error('store: bad numbers');
  if (typeof m.checkedAt !== 'string' || !DATE_RE.test(m.checkedAt)) throw new Error('store: bad date');
  if (typeof m.source !== 'string' || !/^https:\/\//.test(m.source) || m.source.length > 300) throw new Error('store: bad source');
  if (typeof m.openrouter !== 'string' || (m.openrouter && !OR_ID_RE.test(m.openrouter))) throw new Error('store: bad openrouter id');
  return cleanModel(Object.assign({}, m, { note: typeof m.note === 'string' ? m.note.slice(0, 300) : NOTE_ADDED }));
}
// Throws on anything that is not a valid version-1 store.
function parseStore(text) {
  const s = typeof text === 'string' ? JSON.parse(text) : text;
  if (!isObj(s) || s.version !== STORE_VERSION) throw new Error('store: wrong version');
  if (typeof s.updatedAt !== 'string' || !isObj(s.changes) || !Array.isArray(s.added)) throw new Error('store: wrong shape');
  const ids = Object.keys(s.changes);
  if (ids.length > MAX_STORE_ITEMS || s.added.length > MAX_STORE_ITEMS) throw new Error('store: too large');
  const changes = {};
  ids.forEach((id) => {
    const c = s.changes[id];
    if (!ID_RE.test(id) || !isObj(c)) throw new Error('store: bad change ' + id);
    const out = {};
    Object.keys(c).forEach((k) => {
      if (k === 'checkedAt') { if (typeof c[k] !== 'string' || !DATE_RE.test(c[k])) throw new Error('store: bad date'); out[k] = c[k]; return; }
      if (!FIELDS.includes(k)) throw new Error('store: unknown field ' + k);
      const ok = PRICE_FIELDS.includes(k) ? isPrice(c[k]) : isPosInt(c[k]);
      if (!ok) throw new Error('store: bad value for ' + k);
      out[k] = c[k];
    });
    if (!out.checkedAt) throw new Error('store: change without date');
    changes[id] = out;
  });
  return { version: STORE_VERSION, updatedAt: s.updatedAt, changes, added: s.added.map(checkModel) };
}
// Apply a store by id to any model list (built-in, imported CSV, sub-page MODELS). Unknown ids are ignored.
function applyOverrides(models, store) {
  if (!store) return models.map((m) => Object.assign({}, m));
  const out = models.map((m) => {
    const c = has(store.changes, m.id) ? store.changes[m.id] : null;
    return c ? Object.assign({}, m, c, { note: NOTE_UPDATED }) : Object.assign({}, m);
  });
  return appendAdded(out, store.added);
}

// ─── CSV (index.html #csvData) ───
// Records with their text offsets, so unchanged rows can be kept byte for byte.
function csvRecords(text) {
  const recs = [];
  let start = 0, i = 0, cells = [], cur = '', inQ = false;
  const end = (stop, next) => { cells.push(cur); recs.push({ start, end: stop, cells }); cells = []; cur = ''; start = next; };
  for (; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { cells.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      const stop = i;
      if (c === '\r' && text[i + 1] === '\n') i++;
      end(stop, i + 1);
    } else cur += c;
  }
  if (start < text.length) end(text.length, text.length);
  return recs.filter((r) => r.cells.some((v) => v.trim() !== ''));
}
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const sameCell = (raw, v) => {
  if (typeof v === 'number') { const n = Number(raw); return raw.trim() !== '' && Number.isFinite(n) && relDiff(n, v) < EPSILON; }
  return raw === String(v);
};
// Rewrites pin/pout/ctx/maxOutput/checked_at/uwaga of rows whose id is in models and appends models
// that have no row. Other cells, rows, the BOM and the column order stay as they are.
function updateCsvText(text, models) {
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const body = text.slice(bom.length);
  const recs = csvRecords(body);
  if (!recs.length) throw new Error('CSV: no header');
  const head = recs[0].cells.map((h) => h.trim());
  const pos = (name) => head.indexOf(name);
  const idCol = pos('id');
  if (idCol < 0) throw new Error('CSV: no id column');
  const byId = new Map(models.map((m) => [String(m.id), m]));
  const seen = new Set();
  let out = '';
  let last = 0;
  recs.slice(1).forEach((r) => {
    const id = (r.cells[idCol] || '').trim();
    const m = byId.get(id);
    if (!m) return;
    seen.add(id);
    const cells = r.cells.slice();
    let changed = false;
    Object.entries(CSV_COLUMNS).forEach(([field, column]) => {
      const p = pos(column);
      if (p < 0 || m[field] === undefined || m[field] === null) return;
      if (!sameCell(cells[p] || '', m[field])) { cells[p] = String(m[field]); changed = true; }
    });
    if (!changed) return;
    out += body.slice(last, r.start) + cells.map(csvCell).join(',');
    last = r.end;
  });
  out += body.slice(last);
  const extra = models.filter((m) => !seen.has(String(m.id))).map((m) => head.map((h) => csvCell(newRowValue(m, h))).join(','));
  if (extra.length) out += (out.endsWith('\n') ? '' : '\n') + extra.join('\n') + '\n';
  return bom + out;
}
function newRowValue(m, column) {
  switch (column) {
    case 'nazwa': return m.name;
    case 'cena_wejscie_per_1M_USD': return m.pin;
    case 'cena_wyjscie_per_1M_USD': return m.pout;
    case 'okno_kontekstu': return m.ctx;
    case 'klasa': return m.cls || 'standard';
    case 'uwaga': return m.note || '';
    case 'id': return m.id;
    case 'family': return m.family;
    case 'max_output': return m.maxOutput;
    case 'always_thinks': return m.alwaysThinks ? 'true' : 'false';
    case 'checked_at': return m.checkedAt;
    case 'source': return m.source;
    case 'openrouter_id': return m.openrouter || '';
    default: return '';
  }
}

// ─── Exports ───
globalThis.PriceSync = {
  FEED_URL, STORE_KEY, STORE_VERSION, BIG_CHANGE, FIELDS, FAMILY_BY_PROVIDER, KNOWN_FAMILIES, CREATOR_TAG, CONCURRENCY, NOTE_UPDATED, NOTE_ADDED,
  today, round6, parseOpenRouter, endpointsUrl, endpointsFile, creatorEndpoint, creatorMap, diffModels,
  creatorIds, newModelCandidates, fetchCreatorData, creatorUpdate, applyUpdate,
  overridesFrom, parseStore, applyOverrides, csvRecords, updateCsvText,
};
if (typeof module !== 'undefined') module.exports = globalThis.PriceSync;
})();
