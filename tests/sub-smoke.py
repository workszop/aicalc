#!/usr/bin/env python3
"""Chrome smoke test for the sub pages (seats.html, agent.html).

Reuses the server and headless-Chrome helpers from tests/browser-smoke.py
(loaded with importlib because of the hyphen in its file name).  Interactive
flows run as a script appended to a temporary copy of the page; the script
writes a JSON verdict to ``body[data-sub-smoke]``, which ``--dump-dom`` then
captures.  The shipped pages stay test-unaware.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import tempfile
from contextlib import contextmanager
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("browser_smoke", Path(__file__).with_name("browser-smoke.py"))
bs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bs)

SmokeFailure = bs.SmokeFailure
SMOKE_MARKER = "data-sub-smoke"
VIEWPORTS = {"desktop": (1440, 900), "mobile": (390, 844)}

# ─── Injected flows ───
# Shared prelude: expect(), setField(), click() and the verdict writer.
PRELUDE = r"""
const assertions = { n: 0 };
const expect = (cond, msg) => { assertions.n += 1; if (!cond) throw new Error(msg); };
const $ = (sel) => document.querySelector(sel);
const setField = (id, value) => {
  const node = document.querySelector(`[data-field="${id}"]`);
  expect(node, `field ${id} missing`);
  node.value = String(value);
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
};
const click = (sel) => { const n = $(sel); expect(n, `control ${sel} missing`); n.click(); };
const finish = (payload) => document.body.setAttribute('data-sub-smoke', encodeURIComponent(JSON.stringify(payload)));
// The text colour must differ from the background of the nearest card ancestor that paints one.
const visibleOn = (node) => {
  const color = getComputedStyle(node).color;
  let a = node.parentElement;
  while (a) { const bg = getComputedStyle(a).backgroundColor; if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return color !== bg; a = a.parentElement; }
  return color !== getComputedStyle(document.body).backgroundColor;
};
const viewport = () => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth });
"""

SEATS_FLOW = r"""
<script>
(() => {
""" + PRELUDE + r"""
  try {
    const core = SubCore;
    const schemas = [core.SHARED_FIELDS, core.SEAT_FIELDS];
    const cards = $('#seatCards');
    const card = (id) => cards.querySelector(`[data-option="${id}"]`);
    const num = (v) => Number(v);
    const near = (a, b) => Math.abs(num(a) - b) < 0.011;
    expect(document.body.dataset.page === 'seats', 'body[data-page] is not seats');
    expect(document.body.dataset.state === 'ready', 'body[data-state] is not ready on load');
    // defaults
    const wins = cards.querySelectorAll('[data-win="true"]');
    expect(wins.length === 1 && wins[0].dataset.option === 'api', 'default winner is not api');
    expect(near(card('api').dataset.monthly, 835.70), `api monthly ${card('api').dataset.monthly}`);
    expect(near(card('sub').dataset.monthly, 1865.00), `sub monthly ${card('sub').dataset.monthly}`);
    expect(cards.dataset.breakEvenChats === '61.0', `break-even ${cards.dataset.breakEvenChats}`);
    expect(cards.dataset.breakEvenKind === 'from', `break-even kind ${cards.dataset.breakEvenKind}, expected from`);
    const verdictText = () => $('#verdict').textContent;
    expect($('#verdict').getAttribute('aria-live') === 'polite', 'verdict is not a polite live region');
    expect(verdictText() === 'Przy 15 rozmowach dziennie na osobę najtaniej wychodzi API z własnym czatem. Subskrypcja wychodzi taniej niż API od 61 rozmów dziennie na osobę. Lokalnie jest taniej niż subskrypcja przy tym zespole.', `default verdict: ${verdictText()}`);
    expect(/na osobę miesięcznie/.test(card('sub').querySelector('.seat-peruser').textContent), 'per-person line is not "na osobę miesięcznie"');
    // Polish plurals
    expect(SubUI.plural(1, 'a', 'b', 'c') === 'a' && SubUI.plural(2, 'a', 'b', 'c') === 'b' && SubUI.plural(4, 'a', 'b', 'c') === 'b' && SubUI.plural(5, 'a', 'b', 'c') === 'c'
      && SubUI.plural(12, 'a', 'b', 'c') === 'c' && SubUI.plural(22, 'a', 'b', 'c') === 'b' && SubUI.plural(0, 'a', 'b', 'c') === 'c', 'SubUI.plural rules');
    setField('chatsPerDay', 1);
    expect(/^Przy 1 rozmowie dziennie/.test(verdictText()), `singular chats verdict: ${verdictText()}`);
    setField('chatsPerDay', 15);
    // 3 people: seats win and are cheaper than the API at any usage; no contradiction
    setField('users', 3);
    expect(cards.dataset.breakEvenKind === 'always' && cards.dataset.breakEvenChats === '', `users 3: kind ${cards.dataset.breakEvenKind}`);
    expect(card('sub').dataset.win === 'true', 'users 3: seats do not win');
    expect(/najtaniej wychodzi subskrypcja\. Subskrypcja jest tańsza od API przy każdym użyciu\./.test(verdictText()) && !/nie wychodzi taniej/.test(verdictText()), `users 3 verdict contradicts itself: ${verdictText()}`);
    setField('users', 20);
    // plan labels use the page number format
    expect(/25,2 USD/.test($('[data-field="plan"] option[value="m365-copilot"]').textContent), 'PL plan label is not localised');
    const defaults = core.defaultsOf(...schemas);
    ['minPerDay', 'adoption', 'hourlyRate'].forEach((id) => expect(!$(`[data-field="${id}"]`), `seats still has the ${id} field`));
    ['roiOn', 'benefitMonthly', 'setup', 'training', 'ramp', 'horizon'].forEach((id) => expect(!$(`[data-field="${id}"]`), `seats still has the ${id} field`));
    expect(!/zwrot/i.test($('.page-head').textContent + document.title), 'seats head still promises a return');
    // plan source line and note
    const checked = $('#planChecked');
    expect(checked.querySelector('a[target="_blank"][rel~="noopener"]'), 'plan source link missing');
    expect(/2026-11-05/.test(checked.textContent), 'plan checked date missing');
    expect($('#planNote').hidden, 'M365 note visible for the wrong plan');
    setField('plan', 'm365-copilot');
    expect(!$('#planNote').hidden && /Microsoft 365/.test($('#planNote').textContent), 'M365 note missing');
    expect($('#customUsdField').hidden, 'customUsd visible for a known plan');
    setField('plan', 'custom');
    expect(!$('#customUsdField').hidden, 'customUsd hidden for custom plan');
    expect(checked.textContent.trim() === '', 'custom plan must show no price line');
    setField('plan', 'chatgpt-business');
    // a bad customUsd must not block while the plan is not custom
    setField('plan', 'custom');
    setField('customUsd', -1);
    expect(document.body.dataset.state === 'invalid', 'bad customUsd on custom plan must be invalid');
    setField('plan', 'chatgpt-business');
    expect(document.body.dataset.state === 'ready', 'inactive customUsd still blocks');
    setField('plan', 'custom'); setField('customUsd', 30);
    setField('plan', 'chatgpt-business');
    // chatsPerDay 40 -> winner equals the core recomputation
    const heavy = Object.assign({}, defaults, { chatsPerDay: 40 });
    click('[data-preset="40"]');
    expect($('[data-field="chatsPerDay"]').value === '40', 'intensive preset did not set chatsPerDay');
    const want = core.computeSeatResults(heavy, core.MODELS);
    const winners = cards.querySelectorAll('[data-win="true"]');
    expect(winners.length === 1 && winners[0].dataset.option === want.winner, `winner ${winners[0] && winners[0].dataset.option}, expected ${want.winner}`);
    expect(near(card('api').dataset.monthly, want.api.monthly) && near(card('sub').dataset.monthly, want.sub.monthly), 'card amounts differ from core');
    // ineligible API option: the warning must be readable
    setField('inTok', 250000);
    setField('model', 'Anthropic Claude Haiku 4.5');
    expect(card('api').dataset.eligible === 'false' && card('api').querySelector('.seat-warn'), 'api card did not show the warning');
    expect(!/API od|od API|niż API/.test(verdictText()), `ineligible API still has a break-even sentence: ${verdictText()}`);
    expect(visibleOn(card('api').querySelector('.seat-warn')), 'seats warning has the same colour as its card background');
    setField('model', core.defaultsOf(core.SEAT_FIELDS).model);
    setField('inTok', 3000);
    setField('chatsPerDay', 0);
    expect(!/NaN|Infinity/.test($('#resultsPanel').textContent), 'zero chats produced NaN or Infinity');
    setField('inTok', 0); setField('outTok', 0);
    expect(cards.dataset.breakEvenChats === '' && !/NaN|Infinity/.test($('#resultsPanel').textContent), 'zero tokens must give an empty break-even and no NaN');
    expect(cards.dataset.breakEvenKind === 'never', `zero tokens: kind ${cards.dataset.breakEvenKind}, expected never`);
    expect(/Subskrypcja nie wychodzi taniej niż API przy żadnym użyciu\./.test(verdictText()), `never verdict missing: ${verdictText()}`);
    setField('inTok', 3000); setField('outTok', 700);
    setField('chatsPerDay', 15);
    // language switch keeps numbers
    const monthly = card('sub').dataset.monthly;
    const verdictPl = $('#verdict').textContent;
    click('[data-lang="en"]');
    expect($('#verdict').textContent !== verdictPl && card('sub').dataset.monthly === monthly, 'EN switch changed numbers or did not translate');
    expect(verdictText() === 'At 15 chats per person per day, the API with your own chat is the cheapest. A subscription is cheaper than the API from 61 chats per person per day. Local hosting is cheaper than the subscription for this team.', `EN verdict: ${verdictText()}`);
    expect(/25\.2 USD/.test($('[data-field="plan"] option[value="m365-copilot"]').textContent), 'EN plan label not refreshed on language change');
    expect($('nav a[aria-current="page"]').getAttribute('href') === 'seats.html', 'nav current link wrong');
    click('[data-lang="pl"]');
    if (window.matchMedia('(max-width: 768px)').matches) {
      click('#settingsToggle');
      expect($('#app').dataset.settings === 'open', 'drawer did not open');
      click('#settingsBackdrop');
      expect($('#app').dataset.settings === 'closed', 'backdrop did not close the drawer');
    }
    const vp = viewport();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true }));
    expect($('[data-field="chatsPerDay"]').value === '15' && card('api').dataset.win === 'true', 'Alt+R did not reset');
    finish({ ok: true, assertions: assertions.n, viewport: vp });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
})();
</script>
"""

AGENT_FLOW = r"""
<script>
(() => {
""" + PRELUDE + r"""
  try {
    const core = SubCore;
    const card = $('#agentCard');
    const near = (a, b) => Math.abs(Number(a) - b) < 0.011;
    expect(document.body.dataset.page === 'agent', 'body[data-page] is not agent');
    const leadNode = $('.page-head .edu-lead');
    expect(leadNode && !/\bN\b/.test(leadNode.textContent) && /powtarza się/.test(leadNode.textContent), `agent lead still has a literal N: ${leadNode && leadNode.textContent}`);
    expect(!/ręczn|człowiek|ludzi|godzin/i.test(leadNode.textContent), `agent lead mentions manual work or people's time: ${leadNode.textContent}`);
    expect(document.body.dataset.state === 'ready', 'body[data-state] is not ready on load');
    expect(card && near(card.dataset.monthly, 487.64), `monthly ${card && card.dataset.monthly}`);
    expect(card.dataset.perRun === '0.0938', `per run ${card.dataset.perRun}`);
    expect(card.dataset.eligible === 'true', 'default model not eligible');
    const defaults = core.defaultsOf(core.SHARED_FIELDS, core.AGENT_FIELDS);
    const want = core.computeAgentResults(defaults, core.MODELS);
    // ─── details: DOM contract at the defaults (growing context) ───
    const range = core.agentRange(defaults, core.MODELS);
    expect(card.dataset.annual === SubUI.dataNum(want.annual) && card.dataset.annual === '5851.68', `annual ${card.dataset.annual}`);
    expect(card.dataset.low === SubUI.dataNum(range.low) && card.dataset.high === SubUI.dataNum(range.high), `range ${card.dataset.low}-${card.dataset.high}`);
    expect(Number(card.dataset.low) <= Number(card.dataset.monthly) && Number(card.dataset.monthly) <= Number(card.dataset.high), 'range order');
    expect(/Zwykle od .* do .* \/ mies\./.test($('#rangeLine').textContent) && /od połowy do 1,5 raza kroków/.test(card.textContent), `range line: ${$('#rangeLine').textContent}`);
    expect(/Rocznie/.test(card.textContent), 'per-year block missing');
    const bd = $('#costBreakdown');
    expect(!bd.hidden && ['input', 'output', 'retries', 'tools', 'platform'].every((k) => bd.dataset[k] === SubUI.dataNum(want.breakdown[k])), `breakdown ${JSON.stringify(bd.dataset)}`);
    expect(bd.querySelectorAll('.bd-seg').length === 5 && bd.querySelectorAll('.bd-legend li').length === 5, 'breakdown bar or legend incomplete');
    expect(/Najwięcej kosztuje platforma: 61,5% kosztu miesięcznego\./.test(bd.textContent), `largest-part sentence: ${bd.querySelector('.bd-largest').textContent}`);
    const segBorders = [...bd.querySelectorAll('.bd-seg')].map((n) => { const cs = getComputedStyle(n); return [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth]; });
    expect(segBorders.every((b) => b.every((w) => w === b[0] && parseFloat(w) > 0)), `segments are not outlined on all sides: ${JSON.stringify(segBorders)}`);
    const st = $('#stepTable');
    expect(st.dataset.steps === '6' && st.dataset.sum === SubUI.dataNum(want.inPerRun + want.outPerRun, 6), `step table ${st.dataset.steps} / ${st.dataset.sum}`);
    expect([...st.querySelectorAll('tbody tr[data-step] td:nth-child(2)')].map((n) => n.textContent).join('|') === '4000|5000|6000|7000|8000|9000'.split('|').map((v) => SubUI.fmtNum(Number(v))).join('|'), 'step inputs are not 4000..9000');
    expect(st.querySelector('tfoot [data-row="total"] td:last-child').textContent === SubUI.money(want.perRun, 4), 'step total differs from the card');
    expect(/ponowienia \(\+10%\)/.test(st.querySelector('tfoot [data-row="retries"]').textContent), 'retries row label');
    expect($('#stepSection').compareDocumentPosition($('#agentSteps')) & Node.DOCUMENT_POSITION_PRECEDING, 'step table is not after the explanation');
    const mt = $('#modelTable');
    const table = core.agentModelTable(defaults, core.MODELS);
    expect(mt.dataset.cheapest === table[0].name && mt.dataset.current === defaults.model, `model table ${mt.dataset.cheapest} / ${mt.dataset.current}`);
    expect(mt.querySelectorAll('tbody tr').length === core.MODELS.length && mt.querySelectorAll('tbody tr[aria-current="true"]').length === 1, 'model table rows or current marker');
    expect(mt.querySelector('tbody tr[aria-current="true"]').dataset.model === defaults.model && /wybrany/.test(mt.querySelector('tbody tr[aria-current="true"]').textContent), 'current model not marked');
    expect($('#scaleTable').dataset.rows === '4' && $('#scaleTable').querySelectorAll('tbody tr').length === 4, 'scale rows');
    expect($('#scaleTable tbody tr').dataset.runs === '100' && $('#scaleTable tbody tr:last-child').dataset.runs === '100000', 'scale runs');
    expect($('#budgetLine').dataset.runs === '7461' && /Za 1\s000 PLN miesięcznie zmieścisz ok\. 7\s461 uruchomień\./.test($('#budgetLine').textContent), `budget line: ${$('#budgetLine').textContent}`);
    setField('budget', 300);
    expect($('#budgetLine').dataset.runs === '0' && /Budżet nie pokrywa nawet platformy/.test($('#budgetLine').textContent), 'budget below platform');
    setField('budget', 1000);
    // Wybierz picks another model
    click('#modelTable button[data-pick="DeepSeek V4.1 Flash"]');
    expect($('[data-field="model"]').value === 'DeepSeek V4.1 Flash' && mt.dataset.current === 'DeepSeek V4.1 Flash', 'Wybierz did not change the model');
    const ds = core.computeAgentResults(Object.assign({}, defaults, { model: 'DeepSeek V4.1 Flash' }), core.MODELS);
    expect(card.dataset.monthly === SubUI.dataNum(ds.monthly) && mt.querySelector('tbody tr[aria-current="true"]').dataset.model === 'DeepSeek V4.1 Flash', 'card not updated after Wybierz');
    expect(JSON.parse(localStorage.getItem('edulab-aicalc-agent-v1')).model === 'DeepSeek V4.1 Flash', 'Wybierz did not persist');
    setField('model', defaults.model);
    // flat <-> growing
    expect(!$('#toolOutTokField').hidden, 'toolOutTok hidden in growing mode');
    const growingMonthly = card.dataset.monthly;
    click('[data-field="contextMode"] button[data-value="flat"]');
    expect(card.dataset.monthly === '463.02' && card.dataset.monthly !== growingMonthly, `flat monthly ${card.dataset.monthly}`);
    expect($('#toolOutTokField').hidden, 'toolOutTok visible in flat mode');
    setField('toolOutTok', -5);
    expect(document.body.dataset.state === 'ready', 'inactive toolOutTok blocks in flat mode');
    click('[data-field="contextMode"] button[data-value="growing"]');
    expect(document.body.dataset.state === 'invalid', 'bad toolOutTok must block in growing mode');
    setField('toolOutTok', 600);
    expect(card.dataset.monthly === growingMonthly && document.body.dataset.state === 'ready', 'back to growing did not restore');
    // many steps fold the table but the sum covers all of them
    setField('steps', 20);
    const many = core.computeAgentResults(Object.assign({}, defaults, { steps: 20 }), core.MODELS);
    expect(st.dataset.steps === '20' && st.querySelectorAll('tbody tr').length === 9 && st.querySelector('tbody tr.gap-row') && st.querySelector('tbody tr:last-child').dataset.step === '20', 'step table did not fold at 20 steps');
    expect(st.dataset.sum === SubUI.dataNum(many.inPerRun + many.outPerRun, 6), 'folded sum does not cover every step');
    setField('steps', 6);
    // no manual-work comparison, no human review, no hourly rate
    ['manualMonthly', 'savedHours'].forEach((k) => expect(!(k in card.dataset), `card still publishes ${k}`));
    ['manualMin', 'reviewPct', 'reviewMin', 'hourlyRate'].forEach((id) => expect(!$(`[data-field="${id}"]`), `agent still has the ${id} field`));
    expect(!$('#agentBars') && !/Ręcznie|Kontrola człowieka|godzin/i.test($('#app').textContent), 'manual / review copy or bars still on the page');
    expect(/LLM .* · narzędzia .* · platforma/.test(card.textContent), `breakdown is not LLM · narzędzia · platforma: ${card.textContent}`);
    ['roiOn', 'benefitMonthly', 'setup', 'training', 'ramp', 'horizon'].forEach((id) => expect(!$(`[data-field="${id}"]`), `agent still has the ${id} field`));
    expect(!/zwrot/i.test($('.page-head').textContent + document.title) && document.title === 'Agent / automatyzacja – koszt', `agent title: ${document.title}`);
    // steps section: five non-empty items in both languages, switching with the language
    const stepTexts = () => [...document.querySelectorAll('#agentSteps li')].map((li) => li.textContent.trim());
    const stepsPl = stepTexts();
    expect(stepsPl.length === 5 && stepsPl.every((x) => x.length > 0), `agent steps (PL): ${stepsPl.length} items`);
    expect($('#agentSteps h2').textContent.trim() === 'Co agent robi w jednym uruchomieniu' && $('#agentSteps .hint').textContent.trim().length > 0, 'agent steps title or note missing (PL)');
    expect(visibleOn($('#agentSteps li')), 'agent steps text has the same colour as its card background');
    expect(/Obsługa maili|Raport|Faktury/.test($('#presets').textContent) && /przykład/.test($("#settingsPanel").textContent), 'presets or example label missing');
    // preset
    click('[data-preset="report"]');
    expect($('[data-field="runs"]').value === '20' && $('[data-field="steps"]').value === '12', 'report preset values wrong');
    expect($('[data-preset="report"]').getAttribute('aria-pressed') === 'true' && $('[data-preset="mail"]').getAttribute('aria-pressed') === 'false', 'preset aria-pressed wrong');
    setField('runs', 21);
    expect($('[data-preset="report"]').getAttribute('aria-pressed') === 'false', 'preset stays pressed after edit');
    click('[data-preset="mail"]');
    const mailWant = core.computeAgentResults(Object.assign({}, defaults, { runs: 3000, steps: 4 }), core.MODELS);
    click('[data-preset="invoice"]');
    expect($('[data-field="runs"]').value === '800' && $('[data-field="steps"]').value === '5' && $('[data-preset="invoice"]').getAttribute('aria-pressed') === 'true', 'invoice preset values wrong');
    click('[data-preset="mail"]');
    expect($('[data-field="runs"]').value === '3000' && $('[data-field="steps"]').value === '4', 'mail preset values wrong');
    expect(card.dataset.perRun === SubUI.dataNum(mailWant.perRun, 4) && near(card.dataset.monthly, mailWant.monthly), `mail preset per run ${card.dataset.perRun}, expected ${SubUI.dataNum(mailWant.perRun, 4)}`);
    // ineligible model
    setField('inTok', 2000000);
    expect(document.body.dataset.state === 'invalid', 'inTok above schema max must be invalid');
    setField('inTok', 250000);
    expect(card.dataset.eligible === 'true', 'Luna should still fit 250k tokens');
    setField('model', 'Anthropic Claude Haiku 4.5');
    expect(card.dataset.eligible === 'false', `eligible ${card.dataset.eligible} for a context over the model window`);
    expect(/Niedostępne/.test(card.textContent) && /Za długi kontekst/.test(card.textContent), 'ineligible copy missing');
    expect(visibleOn(card.querySelector('.agent-warn')), 'ineligible reason has the same colour as its card background');
    expect(!/NaN|Infinity/.test($('#resultsPanel').textContent), 'NaN in ineligible state');
    expect($('#costBreakdown').hidden && $('#stepSection').hidden && $('#scaleSection').hidden && $('#budgetLine').hidden && $('#budgetLine').dataset.runs === '', 'ineligible: details still visible');
    expect(card.dataset.annual === '' && card.dataset.low === '' && !$('#modelSection').hidden, 'ineligible: card range not cleared or model table hidden');
    const badRow = $('#modelTable tbody tr[aria-current="true"]');
    expect(badRow.dataset.eligible === 'false' && /niedostępny: za długi kontekst/.test(badRow.textContent) && !badRow.querySelector('button'), 'ineligible current row');
    expect($('#modelTable tbody tr:last-child').dataset.eligible === 'false' && $('#modelTable tbody tr').dataset.eligible === 'true', 'ineligible rows are not last');
    setField('model', core.defaultsOf(core.AGENT_FIELDS).model);
    setField('inTok', 4000);
    setField('outTok', 200000);
    expect(card.dataset.eligible === 'false' && /Za długa odpowiedź/.test(card.textContent), 'output-over reason missing');
    setField('outTok', 400);
    expect(card.dataset.eligible === 'true', 'did not recover');
    // zero runs
    setField('runs', 0);
    expect(!/NaN|Infinity/.test($('#resultsPanel').textContent), 'zero runs produced NaN');
    setField('runs', 2000);
    // language
    const monthly = card.dataset.monthly;
    const before = card.textContent;
    click('[data-lang="en"]');
    expect(card.textContent !== before && /LLM .* · tools .* · platform/.test(card.textContent) && card.dataset.monthly === monthly, 'EN switch changed numbers or did not translate');
    const stepsEn = stepTexts();
    expect(stepsEn.length === 5 && stepsEn.every((x) => x.length > 0) && stepsEn.join('|') !== stepsPl.join('|'), `agent steps (EN): ${stepsEn.length} items`);
    expect($('#agentSteps h2').textContent.trim() === 'What the agent does in one run', 'agent steps title missing (EN)');
    expect($('#stepTable thead th').textContent === 'step' && $('#modelTable thead th:nth-child(2)').textContent === 'per run' && /Usually from/.test(card.textContent) && /The largest part is/.test($('#costBreakdown').textContent), 'EN switch did not re-render the details');
    expect($('#scaleTable thead th').textContent === 'runs' && /A budget of/.test($('#budgetLine').textContent), 'EN scale / budget not re-rendered');
    expect($('nav a[aria-current="page"]').getAttribute('href') === 'agent.html', 'nav current link wrong');
    click('[data-lang="pl"]');
    if (window.matchMedia('(max-width: 768px)').matches) {
      click('#settingsToggle');
      expect($('#app').dataset.settings === 'open', 'drawer did not open');
      click('#settingsBackdrop');
      expect($('#app').dataset.settings === 'closed', 'backdrop did not close the drawer');
    }
    const vp = viewport();
    const rp = $('#resultsPanel');
    expect(rp.scrollWidth <= rp.clientWidth + 1, `results panel scrolls sideways: ${rp.scrollWidth} > ${rp.clientWidth}`);
    setField('steps', 7);
    click('[data-field="contextMode"] button[data-value="flat"]');
    setField('budget', 5);
    setField('toolOutTok', 1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true }));
    expect($('[data-field="steps"]').value === '6' && card.dataset.perRun === '0.0938', 'Alt+R did not reset');
    expect($('[data-field="budget"]').value === '1000' && $('[data-field="toolOutTok"]').value === '600' && $('[data-field="contextMode"] button[data-value="growing"]').getAttribute('aria-pressed') === 'true', 'Alt+R did not reset the new fields');
    finish({ ok: true, assertions: assertions.n, viewport: vp });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
})();
</script>
"""

# Runs before the page scripts: plants a stale state, as an old save from an earlier version would leave it.
SEATS_PLANT_HEAD = """<script>try { localStorage.setItem('edulab-aicalc-seats-v1', '{"model":"gone","users":"x"}'); } catch (e) {}</script>"""
SEATS_PLANT_FLOW = r"""
<script>
(() => {
""" + PRELUDE + r"""
  try {
    expect(document.body.dataset.page === 'seats' && document.body.dataset.state === 'ready', 'planted state did not render ready');
    expect($('[data-field="users"]').value === '20', 'stale users did not fall back to the default');
    expect($('[data-field="model"]').value === SubCore.defaultsOf(SubCore.SEAT_FIELDS).model, 'stale model did not fall back');
    expect($('#seatCards [data-win="true"]').dataset.option === 'api', 'planted state broke the winner');
    finish({ ok: true, assertions: assertions.n, viewport: viewport() });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
})();
</script>
"""

# An agent save from before the labour-cost removal: the removed keys are ignored, the rest is kept.
AGENT_PLANT_HEAD = """<script>try { localStorage.setItem('edulab-aicalc-agent-v1', '{"hourlyRate":120,"reviewPct":50,"reviewMin":5,"manualMin":30,"runs":500,"roiOn":true,"benefitMonthly":9000,"horizon":24,"setup":1}'); } catch (e) {}</script>"""
AGENT_PLANT_FLOW = r"""
<script>
(() => {
""" + PRELUDE + r"""
  try {
    expect(document.body.dataset.page === 'agent' && document.body.dataset.state === 'ready', 'old agent save did not render ready');
    expect($('[data-field="runs"]').value === '500', 'old agent save lost runs');
    const s = SubCore.loadState([SubCore.SHARED_FIELDS, SubCore.AGENT_FIELDS], { runs: 500 }, SubCore.MODELS);
    const want = SubCore.computeAgentResults(s, SubCore.MODELS);
    expect($('#agentCard').dataset.monthly === SubUI.dataNum(want.monthly), `old agent save monthly ${$('#agentCard').dataset.monthly}, expected ${SubUI.dataNum(want.monthly)}`);
    setField('runs', 501);
    const saved = JSON.parse(localStorage.getItem('edulab-aicalc-agent-v1'));
    expect(saved.runs === 501 && !('hourlyRate' in saved) && !('manualMin' in saved) && !('reviewPct' in saved) && !('roiOn' in saved) && !('benefitMonthly' in saved) && !('horizon' in saved), 'the next save still carries removed keys');
    finish({ ok: true, assertions: assertions.n, viewport: viewport() });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
})();
</script>
"""

# ─── Price panel (sub/prices-ui.js) ───
# The feed is the trimmed OpenRouter fixture served by the local test server (?pricesUrl= test hook).
PRICES_QUERY = "?pricesUrl=fixtures/openrouter-models.json"
PRICES_BAD_QUERY = "?pricesUrl=fixtures/missing.json"
PRICES_PRELUDE = PRELUDE + r"""
const until = async (fn, label, ms = 8000) => {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timed out: ' + label); await new Promise((r) => setTimeout(r, 25)); }
};
const panel = () => $('#pricePanel');
const STORE = 'edulab-aicalc-prices-v1';
"""
AGENT_PRICES_FLOW = r"""
<script>
window.addEventListener('load', async () => {
""" + PRICES_PRELUDE + r"""
  try {
    const card = $('#agentCard');
    const PRO = 'DeepSeek V4 Pro 0813';
    const defaults = SubCore.defaultsOf(SubCore.SHARED_FIELDS, SubCore.AGENT_FIELDS);
    expect(document.body.dataset.prices === 'builtin', `body data-prices ${document.body.dataset.prices}`);
    expect(card.dataset.monthly === '487.64', `built-in monthly ${card.dataset.monthly}`);
    expect(panel() && panel().dataset.state === 'idle', 'panel missing or not idle');
    expect($('#pricesBtn') && $('#resetBtn').nextElementSibling === $('#pricesBtn'), 'Ceny modeli button is not next to Resetuj');
    expect($('#pricesBtn').textContent === 'Ceny modeli', `button label ${$('#pricesBtn').textContent}`);
    expect($('#priceStatus').textContent === 'Ceny wbudowane, sprawdzone 2026-09-13', `status ${$('#priceStatus').textContent}`);
    expect($('#priceRestore').disabled, 'restore enabled without a store');
    setField('model', PRO);
    const before = card.dataset.monthly;
    const builtinPro = SubCore.MODELS.find((m) => m.name === PRO);
    click('#pricesBtn');
    expect(panel().open && document.activeElement === $('#priceFetch'), 'panel did not open with focus on fetch');
    click('#priceFetch');
    expect(panel().dataset.state === 'loading' && panel().getAttribute('aria-busy') === 'true', `state ${panel().dataset.state} right after fetch`);
    expect($('#priceMsg').getAttribute('aria-live') === 'polite' && /Pobieram/.test($('#priceMsg').textContent), 'loading message');
    await until(() => panel().dataset.state !== 'loading', 'fetch');
    expect(panel().dataset.state === 'ready', `state ${panel().dataset.state}: ${$('#priceMsg').textContent}`);
    expect(panel().dataset.changes === '6' && panel().dataset.new === '15' && panel().dataset.missing === '0', `counts ${panel().dataset.changes}/${panel().dataset.new}/${panel().dataset.missing}`);
    const bigRow = $('#priceChanges tr[data-model-id="deepseek-v4-pro"][data-field="pin"]');
    expect(bigRow && !bigRow.querySelector('input').checked && /duża zmiana, sprawdź u dostawcy/.test(bigRow.textContent), 'big change is not unchecked and badged');
    expect([...document.querySelectorAll('#priceNew input')].every((b) => !b.checked), 'new models are pre-checked');
    expect(/OpenAI GPT-6\.1 Terra/.test($('#priceNew').textContent), 'candidate names missing');
    expect(panel().getBoundingClientRect().right <= window.innerWidth + 0.5, 'panel wider than the viewport');
    // accept only DeepSeek V4 Pro output 3.96 -> 4.44
    document.querySelectorAll('#priceChanges input:checked').forEach((b) => { b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true })); });
    expect($('#priceApply').disabled, 'apply enabled with nothing selected');
    const box = $('#priceChanges tr[data-model-id="deepseek-v4-pro"][data-field="pout"] input');
    box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
    click('#priceApply');
    expect(panel().dataset.state === 'applied', `state after apply ${panel().dataset.state}`);
    const want = SubCore.computeAgentResults(Object.assign({}, defaults, { model: PRO }), SubCore.MODELS.map((m) => m.name === PRO ? Object.assign({}, builtinPro, { pout: 4.44 }) : m));
    expect(card.dataset.monthly === SubUI.dataNum(want.monthly) && card.dataset.monthly !== before, `monthly after apply ${card.dataset.monthly}, expected ${SubUI.dataNum(want.monthly)} (before ${before})`);
    expect($(`#modelTable tr[data-model="${PRO}"]`).dataset.monthly === SubUI.dataNum(want.monthly), 'model table not recomputed');
    expect(SubCore.MODELS.find((m) => m.name === PRO).pin === 1.32, 'unselected big change was applied');
    expect(document.body.dataset.prices === 'openrouter' && /^Zaktualizowane z OpenRouter \d{4}-\d{2}-\d{2}$/.test($('#priceStatus').textContent), 'status after apply');
    const store = JSON.parse(localStorage.getItem(STORE));
    expect(store.version === 1 && store.changes['deepseek-v4-pro'].pout === 4.44 && !('pin' in store.changes['deepseek-v4-pro']), `store ${localStorage.getItem(STORE)}`);
    click('#priceClose');
    await until(() => document.activeElement === $('#pricesBtn'), 'focus back on the button');
    expect(!panel().open, 'panel still open after Zamknij');
    // restore
    click('#pricesBtn');
    click('#priceRestore');
    expect(localStorage.getItem(STORE) === null && document.body.dataset.prices === 'builtin' && panel().dataset.state === 'idle', 'restore did not clear the store');
    expect(card.dataset.monthly === before, `restore monthly ${card.dataset.monthly}, expected ${before}`);
    expect(/Przywrócono/.test($('#priceMsg').textContent), 'restore message');
    // English labels
    click('#priceClose');
    click('[data-lang="en"]');
    expect($('#pricesBtn').textContent === 'Model prices' && $('#priceFetch').textContent === 'Fetch current prices', 'EN labels');
    click('[data-lang="pl"]');
    setField('model', defaults.model);
    expect(card.dataset.monthly === '487.64', 'built-in number not back');
    finish({ ok: true, assertions: assertions.n, viewport: viewport() });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
});
</script>
"""
AGENT_PRICES_ERROR_FLOW = r"""
<script>
window.addEventListener('load', async () => {
""" + PRICES_PRELUDE + r"""
  try {
    const card = $('#agentCard');
    click('#pricesBtn');
    click('#priceFetch');
    await until(() => panel().dataset.state !== 'loading', 'fetch');
    expect(panel().dataset.state === 'error', `state ${panel().dataset.state}`);
    expect($('#priceMsg').textContent === 'Nie udało się pobrać cen z OpenRouter. Spróbuj później.', `error message ${$('#priceMsg').textContent}`);
    expect(card.dataset.monthly === '487.64' && localStorage.getItem(STORE) === null && document.body.dataset.prices === 'builtin', 'error path changed something');
    expect($('#priceApply').closest('.pp-foot').hidden, 'apply shown on error');
    finish({ ok: true, assertions: assertions.n, viewport: viewport() });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
});
</script>
"""
# A store saved by an earlier visit (the reload case): applied before the first render.
PRICES_STORE = {"version": 1, "updatedAt": "2026-11-06T08:00:00.000Z", "changes": {"gpt-5.6-luna": {"pout": 2.4, "checkedAt": "2026-11-06"}, "no-such-model": {"pin": 1, "checkedAt": "2026-11-06"}},
                "added": [{"id": "gpt-6-luna", "name": "OpenAI GPT-6 Luna", "openrouter": "openai/gpt-6-luna", "family": "openai", "cls": "standard", "alwaysThinks": False,
                           "pin": 0.1, "pout": 0.5, "ctx": 1050000, "maxOutput": 128000, "checkedAt": "2026-11-06", "source": "https://openrouter.ai/openai/gpt-6-luna", "note": "Dodany z OpenRouter, sprawdź cenę u dostawcy."}]}
PRICES_PLANT_HEAD = "<script>try { localStorage.setItem('edulab-aicalc-prices-v1', " + json.dumps(json.dumps(PRICES_STORE)) + "); } catch (e) {}</script>"
AGENT_PRICES_STORED_FLOW = r"""
<script>
(() => {
""" + PRICES_PRELUDE + r"""
  try {
    const card = $('#agentCard');
    const defaults = SubCore.defaultsOf(SubCore.SHARED_FIELDS, SubCore.AGENT_FIELDS);
    expect(document.body.dataset.prices === 'openrouter', 'stored prices not reported');
    expect(SubCore.MODELS.length === 11 && SubCore.MODELS[10].name === 'OpenAI GPT-6 Luna', 'added model missing or duplicated');
    expect(SubCore.MODELS[0].pout === 2.4, 'stored change not applied');
    const want = SubCore.computeAgentResults(defaults, SubCore.MODELS);
    expect(card.dataset.monthly === SubUI.dataNum(want.monthly) && card.dataset.monthly !== '487.64', `stored monthly ${card.dataset.monthly}`);
    expect($('[data-field="model"] option[value="OpenAI GPT-6 Luna"]'), 'added model not in the select');
    expect($('#modelTable').querySelectorAll('tbody tr').length === 11, 'model table without the added model');
    expect($('#priceStatus').textContent === 'Zaktualizowane z OpenRouter 2026-11-06', `status ${$('#priceStatus').textContent}`);
    // restore brings back the built-in list
    click('#pricesBtn');
    click('#priceRestore');
    expect(SubCore.MODELS.length === 10 && card.dataset.monthly === '487.64' && !$('[data-field="model"] option[value="OpenAI GPT-6 Luna"]'), 'restore did not bring back the built-in list');
    finish({ ok: true, assertions: assertions.n, viewport: viewport() });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
})();
</script>
"""
PRICES_CORRUPT_HEAD = """<script>try { localStorage.setItem('edulab-aicalc-prices-v1', '{"version":1,"changes":{"gpt-5.6-luna":{"pin":-5}}}'); } catch (e) {}</script>"""
AGENT_PRICES_CORRUPT_FLOW = r"""
<script>
(() => {
""" + PRICES_PRELUDE + r"""
  try {
    expect(document.body.dataset.prices === 'builtin' && localStorage.getItem(STORE) === null, 'corrupt store not removed');
    expect($('#agentCard').dataset.monthly === '487.64', 'corrupt store changed the numbers');
    finish({ ok: true, assertions: assertions.n, viewport: viewport() });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
})();
</script>
"""
SEATS_PRICES_FLOW = r"""
<script>
window.addEventListener('load', async () => {
""" + PRICES_PRELUDE + r"""
  try {
    const api = () => $('#seatCards [data-option="api"]').dataset.monthly;
    expect(Math.abs(Number(api()) - 835.70) < 0.011, `built-in api ${api()}`);
    expect($('#resetBtn').nextElementSibling === $('#pricesBtn'), 'button not next to Resetuj');
    click('#pricesBtn');
    click('#priceFetch');
    await until(() => panel().dataset.state !== 'loading', 'fetch');
    expect(panel().dataset.state === 'ready' && panel().dataset.changes === '6', `state ${panel().dataset.state}`);
    const box = [...document.querySelectorAll('#priceNew input')].find((b) => b.closest('tr').dataset.openrouter === 'openai/gpt-6-luna');
    box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
    click('#priceApply');
    expect(SubCore.MODELS.some((m) => m.id === 'gpt-6-luna') && $('[data-field="model"] option[value="OpenAI GPT-6 Luna"]'), 'added model not offered');
    expect(Math.abs(Number(api()) - 835.70) < 0.011, 'seats default model changed by unrelated updates');
    setField('model', 'OpenAI GPT-6 Luna');
    expect(api() !== '' && api() !== '835.7', `api with the new model ${api()}`);
    click('#priceClose');
    click('#pricesBtn');
    click('#priceRestore');
    expect($('[data-field="model"]').value === SubCore.SEAT_FIELDS.model.def && Math.abs(Number(api()) - 835.70) < 0.011, 'restore did not fall back to the default model');
    finish({ ok: true, assertions: assertions.n, viewport: viewport() });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
});
</script>
"""

# Narrow phones: the agent page in an iframe 360 / 320 px wide. Tables may scroll inside .table-wrap, the page may not.
NARROW_VIEWPORTS = ((360, 800), (320, 700))
NARROW_FRAME_PAGE = """<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
<div id="probe"></div><iframe src="{page}?pricesUrl=fixtures/openrouter-models.json" width="{w}" height="{h}" style="border:0;display:block"></iframe>
</body></html>"""
NARROW_SCRIPT = r"""
<script>
window.addEventListener('load', async () => {
  const failures = [];
  const rp = document.querySelector('#resultsPanel');
  const de = document.documentElement;
  if (de.scrollWidth > window.innerWidth) failures.push(`page scrolls sideways: ${de.scrollWidth} > ${window.innerWidth}`);
  if (rp.scrollWidth > rp.clientWidth + 1) failures.push(`#resultsPanel scrolls sideways: ${rp.scrollWidth} > ${rp.clientWidth}`);
  const edge = rp.getBoundingClientRect().right;
  const outside = [...rp.querySelectorAll('*')].filter((n) => !n.closest('.table-wrap') && n.getClientRects().length && n.getBoundingClientRect().right > edge + 0.5);
  outside.slice(0, 5).forEach((n) => failures.push(`${n.tagName.toLowerCase()}#${n.id || n.className} runs past the panel edge`));
  const wraps = [...rp.querySelectorAll('.table-wrap')];
  if (wraps.length !== 3) failures.push(`expected 3 table wrappers, found ${wraps.length}`);
  wraps.forEach((w) => { if (getComputedStyle(w).overflowX !== 'auto') failures.push('a table wrapper does not scroll'); if (w.getBoundingClientRect().right > edge + 0.5) failures.push('a table wrapper is wider than the panel'); });
  // On a phone the model table is stacked, so every pick button is visible without scrolling the table sideways.
  const picks = [...rp.querySelectorAll('#modelTable button[data-pick]')];
  if (!picks.length) failures.push('no Wybierz buttons in the model table');
  picks.forEach((btn) => { if (btn.getBoundingClientRect().right > edge + 0.5) failures.push(`Wybierz for ${btn.dataset.pick} is off-screen`); });
  const mtWrap = rp.querySelector('#modelTable').closest('.table-wrap');
  if (mtWrap && mtWrap.scrollWidth > mtWrap.clientWidth + 1) failures.push('the model table still scrolls sideways on a phone');
  // the price panel at this width: open, load the fixture, nothing outside the viewport except inside .pp-wrap
  document.getElementById('pricesBtn').click();
  document.getElementById('priceFetch').click();
  for (let i = 0; i < 300 && document.getElementById('pricePanel').dataset.state === 'loading'; i++) await new Promise((r) => setTimeout(r, 25));
  const pp = document.getElementById('pricePanel');
  if (pp.dataset.state !== 'ready') failures.push(`price panel state ${pp.dataset.state}`);
  const ppRect = pp.getBoundingClientRect();
  if (ppRect.left < 0 || ppRect.right > window.innerWidth + 0.5) failures.push(`price panel ${Math.round(ppRect.left)}-${Math.round(ppRect.right)} outside ${window.innerWidth}px`);
  [...pp.querySelectorAll('*')].filter((n) => !n.closest('.pp-wrap') && n.getClientRects().length && n.getBoundingClientRect().right > ppRect.right + 0.5)
    .slice(0, 5).forEach((n) => failures.push(`price panel: ${n.tagName.toLowerCase()}#${n.id || n.className} runs past the panel edge`));
  window.parent.document.getElementById('probe').setAttribute('data-narrow-smoke', encodeURIComponent(JSON.stringify({
    ok: failures.length === 0, failures, width: window.innerWidth,
    scrolling: wraps.filter((w) => w.scrollWidth > w.clientWidth).length,
  })));
});
</script>
"""


def run_narrow(browser, page: str, lines: list[str]) -> None:
    with page_fixture(page, NARROW_SCRIPT) as root:
        for w, h in NARROW_VIEWPORTS:
            (root / f"frame-{w}.html").write_text(NARROW_FRAME_PAGE.format(page=page, w=w, h=h), encoding="utf-8")
        with bs.local_server(root) as server:
            for width, height in NARROW_VIEWPORTS:
                label = f"{page} narrow {width}px"
                url = f"http://127.0.0.1:{server.server_port}/frame-{width}.html"
                bs.probe_http(url)
                probe = parse(bs.run_browser(browser, url, label, window_size=(max(width, 500), height + 100), virtual_time_ms=15000), label).get("#probe", {})
                encoded = probe.get("data-narrow-smoke", "")
                if not encoded:
                    raise SmokeFailure(f"{label}: the narrow probe emitted nothing")
                payload = json.loads(unquote(encoded))
                if int(payload.get("width", 0)) != width:
                    raise SmokeFailure(f"{label}: viewport is {payload.get('width')}px, expected {width}px")
                if payload.get("ok") is not True:
                    raise SmokeFailure(f"{label}: " + "; ".join(payload.get("failures") or ["unknown failure"]))
                lines.append(f"{label}: no sideways scroll ({payload.get('scrolling')} tables scroll inside their wrapper), price panel fits")


# ─── DOM parsing ───
class AttrParser(HTMLParser):
    """Collect attributes of <body>, <html> and every element with an id."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.nodes: dict[str, dict[str, str]] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        if tag in ("body", "html"):
            self.nodes.setdefault(tag, a)
        if a.get("id"):
            self.nodes.setdefault("#" + a["id"], a)

    handle_startendtag = handle_starttag


def parse(dom: str, label: str) -> dict[str, dict[str, str]]:
    parser = AttrParser()
    try:
        parser.feed(dom)
        parser.close()
    except Exception as error:
        raise SmokeFailure(f"{label}: could not parse DOM: {error}") from error
    return parser.nodes


def check_verify(dom: str, label: str, page: str) -> tuple[int, int]:
    nodes = parse(dom, label)
    body = nodes.get("body", {})
    if body.get("data-page") != page:
        raise SmokeFailure(f"{label}: body data-page={body.get('data-page')!r}, expected {page!r}")
    if body.get("data-state") != "ready":
        raise SmokeFailure(f"{label}: body data-state={body.get('data-state')!r}, expected 'ready'")
    panel = nodes.get("#checksPanel")
    if not panel:
        raise SmokeFailure(f"{label}: no #checksPanel")
    try:
        passed, total = int(panel.get("data-passed", "")), int(panel.get("data-total", ""))
    except ValueError as error:
        raise SmokeFailure(f"{label}: #checksPanel has no numeric data-passed/data-total") from error
    if panel.get("data-state") != "pass" or total <= 0 or passed != total:
        raise SmokeFailure(f"{label}: checks {passed}/{total}, data-state={panel.get('data-state')!r}")
    return passed, total


def check_flow(dom: str, label: str) -> int:
    body = parse(dom, label).get("body", {})
    encoded = body.get(SMOKE_MARKER, "")
    if not encoded:
        raise SmokeFailure(f"{label}: the injected flow emitted no {SMOKE_MARKER} (page script error?)")
    payload = json.loads(unquote(encoded))
    if payload.get("ok") is not True:
        raise SmokeFailure(f"{label}: {payload.get('error')} (after {payload.get('assertions')} assertions)")
    vp = payload["viewport"]
    if int(vp["scrollWidth"]) > int(vp["width"]) + 1:
        raise SmokeFailure(f"{label}: horizontal overflow ({vp['scrollWidth']}px > {vp['width']}px)")
    return int(payload["assertions"])


@contextmanager
def page_fixture(page: str, flow: str, head: str = ""):
    """Yield a temporary copy of the repo's sub pages with ``flow`` injected into ``page``."""

    source = (ROOT / page).read_text(encoding="utf-8")
    if "</body>" not in source:
        raise SmokeFailure(f"{page}: no </body> to inject the flow before")
    with tempfile.TemporaryDirectory(prefix="aicalc-sub-fixture-") as directory:
        root = Path(directory)
        text = source.replace("</body>", flow + "\n</body>", 1)
        if head:
            text = text.replace("</head>", head + "\n</head>", 1)
        (root / page).write_text(text, encoding="utf-8")
        shutil.copytree(ROOT / "sub", root / "sub")
        if (ROOT / "assets").is_dir():
            shutil.copytree(ROOT / "assets", root / "assets")
        shutil.copytree(ROOT / "tests" / "fixtures", root / "fixtures")
        yield root


# ─── Runner ───
def run_page(browser, page: str, key: str, flow: str, query: str, lines: list[str], head_flows=()) -> None:
    """Verify (http desktop/mobile, file://), then the injected flow(s) over the same transports."""

    if not (ROOT / page).is_file():
        raise SmokeFailure(f"Repository has no {page}")
    with bs.local_server(ROOT) as server:
        base = f"http://127.0.0.1:{server.server_port}"
        for name, size in VIEWPORTS.items():
            url = f"{base}/{page}?verify=1"
            bs.probe_http(url)
            label = f"{page} verify http {name}"
            passed, total = check_verify(bs.run_browser(browser, url, label, window_size=size), label, key)
            lines.append(f"{label}: checks {passed}/{total}")

    file_url = f"{(ROOT / page).resolve().as_uri()}?verify=1"
    label = f"{page} verify file://"
    passed, total = check_verify(bs.run_browser(browser, file_url, label), label, key)
    lines.append(f"{label}: checks {passed}/{total}")

    for tag, flow_text, head in [("flow", flow, "")] + list(head_flows):
        with page_fixture(page, flow_text, head) as root:
            with bs.local_server(root) as server:
                for name, size in VIEWPORTS.items():
                    label = f"{page} {tag} http {name}"
                    url = f"http://127.0.0.1:{server.server_port}/{page}{query if tag == 'flow' else ''}"
                    bs.probe_http(url)
                    n = check_flow(bs.run_browser(browser, url, label, window_size=size), label)
                    lines.append(f"{label}: {n} assertions")
            label = f"{page} {tag} file://"
            n = check_flow(bs.run_browser(browser, (root / page).resolve().as_uri() + (query if tag == 'flow' else ''), label), label)
            lines.append(f"{label}: {n} assertions")


def run_prices(browser, lines: list[str]) -> None:
    """Price panel flows over http (the fetch needs a server); async flows get a virtual-time budget."""

    cases = [
        ("agent.html", "prices", AGENT_PRICES_FLOW, "", PRICES_QUERY),
        ("agent.html", "prices-error", AGENT_PRICES_ERROR_FLOW, "", PRICES_BAD_QUERY),
        ("agent.html", "prices-stored", AGENT_PRICES_STORED_FLOW, PRICES_PLANT_HEAD, ""),
        ("agent.html", "prices-corrupt", AGENT_PRICES_CORRUPT_FLOW, PRICES_CORRUPT_HEAD, ""),
        ("seats.html", "prices", SEATS_PRICES_FLOW, "", PRICES_QUERY),
    ]
    for page, tag, flow, head, query in cases:
        with page_fixture(page, flow, head) as root:
            with bs.local_server(root) as server:
                for name, size in VIEWPORTS.items():
                    label = f"{page} {tag} http {name}"
                    url = f"http://127.0.0.1:{server.server_port}/{page}{query}"
                    bs.probe_http(url)
                    n = check_flow(bs.run_browser(browser, url, label, window_size=size, virtual_time_ms=15000), label)
                    lines.append(f"{label}: {n} assertions")


def run() -> list[str]:
    browser = bs.find_browser()
    lines: list[str] = []
    run_page(browser, "seats.html", "seats", SEATS_FLOW, "", lines, head_flows=[("stale-state", SEATS_PLANT_FLOW, SEATS_PLANT_HEAD)])
    run_page(browser, "agent.html", "agent", AGENT_FLOW, "", lines, head_flows=[("old-save", AGENT_PLANT_FLOW, AGENT_PLANT_HEAD)])
    run_narrow(browser, "agent.html", lines)
    run_prices(browser, lines)
    return lines


def main() -> int:
    try:
        lines = run()
    except SmokeFailure as error:
        print(f"sub-smoke: FAIL: {error}", file=sys.stderr)
        return 1
    print("sub-smoke: PASS")
    for line in lines:
        print("  " + line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
