#!/usr/bin/env python3
"""Chrome smoke test for the sub pages (roi.html, seats.html, agent.html).

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

ROI_FLOW = r"""
<script>
(() => {
""" + PRELUDE + r"""
  try {
    const panel = $('#roiPanel');
    expect(document.body.dataset.page === 'roi', 'body[data-page] is not roi');
    expect(document.body.dataset.state === 'ready', 'body[data-state] is not ready on load');
    expect(panel && panel.dataset.on === 'true', '#roiPanel data-on is not true');
    // ?cost=1000&oneOff=25000 prefill
    expect($('[data-field="costMonthly"]').value === '1000', 'cost prefill missing');
    expect($('[data-field="setup"]').value === '25000', 'oneOff prefill missing');
    expect($('[data-field="training"]').value === '0', 'training not zeroed by oneOff');
    // the benefit is an entered monthly amount only: no time mode, no time fields, no caveat
    expect(!$('[data-field="benefitMode"]') && !$('#timeFields') && !$('#amountFields'), 'time / amount mode controls still present');
    ['users', 'workDays'].forEach((id) => expect(!$(`[data-field="${id}"]`), `time-mode field ${id} still present`));
    expect($('[data-field="benefitMonthly"]').value === '5000', `benefitMonthly default ${$('[data-field="benefitMonthly"]').value}, expected 5000`);
    expect($('label[for="f-benefitMonthly"]').textContent === 'Korzyść miesięcznie', `benefit label ${$('label[for="f-benefitMonthly"]').textContent}`);
    expect(/oszczędności na innych kosztach lub dodatkowy przychód/.test($('#settingsPanel').textContent), 'benefit help missing');
    expect(!panel.querySelector('[data-roi="caveat"]') && !/wartość, nie gotówka/.test(panel.textContent), 'time caveat still in the ROI panel');
    // 5000, ramp 3, horizon 12 -> payback in month 8
    setField('benefitMonthly', 5000);
    setField('ramp', 3);
    setField('horizon', 12);
    expect(panel.dataset.paybackMonth === '8', `payback month ${panel.dataset.paybackMonth}, expected 8`);
    expect(panel.dataset.seriesLength === '13', `series length ${panel.dataset.seriesLength}, expected 13`);
    expect(panel.dataset.benefitMonthly === '5000' && panel.dataset.costMonthly === '1000', 'benefit/cost attributes wrong');
    const path = panel.querySelector('svg [data-series="net"]');
    expect(path && !/NaN|Infinity/.test(path.getAttribute('d')), 'chart line missing or non-finite');
    expect(panel.querySelector('svg [data-mark="zero"]'), 'chart zero line missing');
    expect(panel.querySelector('svg [data-mark="payback"]'), 'chart payback marker missing');
    // invalid input pauses results without calling onChange
    setField('horizon', 3);
    expect(document.body.dataset.state === 'invalid', 'invalid horizon did not set data-state=invalid');
    expect($('[data-field="horizon"]').getAttribute('aria-invalid') === 'true', 'aria-invalid missing');
    expect(panel.dataset.seriesLength === '13', 'invalid input reached the results');
    setField('horizon', 12);
    expect(document.body.dataset.state === 'ready', 'state not ready after fixing the field');
    // language switch: text changes, numbers do not
    const before = { roi: panel.dataset.roiPct, pay: panel.dataset.paybackMonth };
    const axisBefore = panel.querySelector('svg [data-axis="x"]').textContent;
    click('[data-lang="en"]');
    expect(document.documentElement.lang === 'en', 'html lang not en');
    expect($('label[for="f-benefitMonthly"]').textContent === 'Monthly benefit', 'EN benefit label');
    expect(/savings on other costs or extra revenue/.test($('#settingsPanel').textContent), 'EN benefit help missing');
    expect(panel.querySelector('svg [data-axis="x"]').textContent !== axisBefore, 'chart axis label did not switch');
    expect(panel.dataset.roiPct === before.roi && panel.dataset.paybackMonth === before.pay, 'numbers changed on language switch');
    expect($('nav a[aria-current="page"]').getAttribute('href') === 'roi.html', 'nav current link wrong');
    // an invalid benefit blocks the results until it is fixed
    setField('benefitMonthly', -1);
    expect(document.body.dataset.state === 'invalid' && panel.dataset.benefitMonthly === '5000', 'negative benefit must be invalid and not reach the panel');
    setField('benefitMonthly', 5000);
    expect(document.body.dataset.state === 'ready' && panel.dataset.paybackMonth === before.pay, 'fixing the benefit did not restore the result');
    // data-roi-pct goes through dataNum: an ROI that rounds to zero prints "0", never "-0.0"
    setField('benefitMonthly', 1999.9);
    setField('costMonthly', 0); setField('setup', 72000); setField('training', 0); setField('ramp', 0); setField('horizon', 36);
    expect(panel.dataset.roiPct === '0', `near-zero roi-pct ${panel.dataset.roiPct}, expected 0`);
    setField('benefitMonthly', 5000); setField('costMonthly', 1000); setField('setup', 25000); setField('ramp', 3); setField('horizon', 12);
    if (window.matchMedia('(max-width: 768px)').matches) {
      click('#settingsToggle');
      expect($('#app').dataset.settings === 'open' && $('#settingsToggle').getAttribute('aria-expanded') === 'true', 'drawer did not open');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect($('#app').dataset.settings === 'closed', 'Escape did not close the drawer');
      click('#settingsToggle');
      click('#settingsBackdrop');
      expect($('#app').dataset.settings === 'closed', 'backdrop did not close the drawer');
    } else {
      click('#settingsToggle');
      expect($('#app').dataset.settings === 'closed', 'drawer opened on desktop');
    }
    const vp = viewport();
    // Alt+R reset
    setField('benefitMonthly', 1234);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true }));
    expect($('[data-field="benefitMonthly"]').value === '5000' && panel.dataset.benefitMonthly === '5000', 'Alt+R did not reset the benefit');
    expect($('[data-field="horizon"]').value === '36', 'Alt+R did not reset horizon');
    finish({ ok: true, assertions: assertions.n, viewport: vp });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
})();
</script>
"""

SEATS_FLOW = r"""
<script>
(() => {
""" + PRELUDE + r"""
  try {
    const core = SubCore;
    const schemas = [core.SHARED_FIELDS, core.SEAT_FIELDS, core.ROI_FIELDS];
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
    // roi panel follows the winner
    const roi = $('#roiPanel');
    const defaults = core.defaultsOf(...schemas);
    expect(roi.dataset.on === 'true', 'roi panel not on');
    expect(near(roi.dataset.costMonthly, num(card('api').dataset.monthly)), 'roi cost is not the winner monthly');
    expect(roi.dataset.benefitMonthly === String(defaults.benefitMonthly), `roi benefit ${roi.dataset.benefitMonthly}, expected the entered ${defaults.benefitMonthly}`);
    ['minPerDay', 'adoption', 'hourlyRate'].forEach((id) => expect(!$(`[data-field="${id}"]`), `seats still has the ${id} field`));
    expect($('[data-accent="roi"] [data-field="benefitMonthly"]'), 'seats ROI settings lack benefitMonthly');
    setField('benefitMonthly', 12000);
    const seatRoiWant = core.computeRoi({ costMonthly: Number(card('api').dataset.monthly), benefitMonthly: 12000, oneOff: defaults.setup + defaults.training, ramp: defaults.ramp, horizon: defaults.horizon });
    expect(roi.dataset.benefitMonthly === '12000' && roi.dataset.paybackMonth === String(seatRoiWant.paybackMonth ?? ''), `seats roi after benefit 12000: ${roi.dataset.benefitMonthly} / ${roi.dataset.paybackMonth}`);
    setField('benefitMonthly', defaults.benefitMonthly);
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
    // roi toggle
    setField('inTok', 3000); setField('outTok', 700);
    click('[data-field="roiOn"]');
    expect(roi.dataset.on === 'false', 'roi toggle did not hide the panel');
    click('[data-field="roiOn"]');
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
    const roi = $('#roiPanel');
    const near = (a, b) => Math.abs(Number(a) - b) < 0.011;
    expect(document.body.dataset.page === 'agent', 'body[data-page] is not agent');
    const leadNode = $('.page-head .edu-lead');
    expect(leadNode && !/\bN\b/.test(leadNode.textContent) && /powtarza się/.test(leadNode.textContent), `agent lead still has a literal N: ${leadNode && leadNode.textContent}`);
    expect(!/ręczn|człowiek|ludzi|godzin/i.test(leadNode.textContent), `agent lead mentions manual work or people's time: ${leadNode.textContent}`);
    expect(document.body.dataset.state === 'ready', 'body[data-state] is not ready on load');
    expect(card && near(card.dataset.monthly, 463.02), `monthly ${card && card.dataset.monthly}`);
    expect(card.dataset.perRun === '0.0815', `per run ${card.dataset.perRun}`);
    expect(card.dataset.eligible === 'true', 'default model not eligible');
    expect(roi.dataset.on === 'true', 'roi panel not on');
    const defaults = core.defaultsOf(core.SHARED_FIELDS, core.AGENT_FIELDS, core.ROI_FIELDS);
    const want = core.computeAgentResults(defaults, core.MODELS);
    const roiWant = core.computeRoi({ costMonthly: want.monthly, benefitMonthly: defaults.benefitMonthly, oneOff: defaults.setup + defaults.training, ramp: defaults.ramp, horizon: defaults.horizon });
    expect(roi.dataset.paybackMonth === String(roiWant.paybackMonth), `payback month ${roi.dataset.paybackMonth}, expected ${roiWant.paybackMonth}`);
    expect(near(roi.dataset.costMonthly, want.monthly), 'roi cost is not the agent monthly');
    expect(roi.dataset.benefitMonthly === String(defaults.benefitMonthly), `roi benefit ${roi.dataset.benefitMonthly}, expected the entered ${defaults.benefitMonthly}`);
    // no manual-work comparison, no human review, no hourly rate
    ['manualMonthly', 'savedHours'].forEach((k) => expect(!(k in card.dataset), `card still publishes ${k}`));
    ['manualMin', 'reviewPct', 'reviewMin', 'hourlyRate'].forEach((id) => expect(!$(`[data-field="${id}"]`), `agent still has the ${id} field`));
    expect(!$('#agentBars') && !/Ręcznie|Kontrola człowieka|godzin/i.test($('#app').textContent), 'manual / review copy or bars still on the page');
    expect(/LLM .* · narzędzia .* · platforma/.test(card.textContent), `breakdown is not LLM · narzędzia · platforma: ${card.textContent}`);
    expect($('[data-accent="roi"] [data-field="benefitMonthly"]'), 'agent ROI settings lack benefitMonthly');
    setField('benefitMonthly', 800);
    expect(roi.dataset.benefitMonthly === '800', 'benefit edit did not reach the ROI panel');
    setField('benefitMonthly', defaults.benefitMonthly);
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
    expect(roi.dataset.on === 'false', 'roi panel should be off for an ineligible model');
    expect(!/NaN|Infinity/.test($('#resultsPanel').textContent), 'NaN in ineligible state');
    setField('model', core.defaultsOf(core.AGENT_FIELDS).model);
    setField('inTok', 4000);
    setField('outTok', 200000);
    expect(card.dataset.eligible === 'false' && /Za długa odpowiedź/.test(card.textContent), 'output-over reason missing');
    setField('outTok', 400);
    expect(card.dataset.eligible === 'true' && roi.dataset.on === 'true', 'did not recover');
    // zero runs
    setField('runs', 0);
    expect(!/NaN|Infinity/.test($('#resultsPanel').textContent), 'zero runs produced NaN');
    setField('runs', 2000);
    // roi toggle
    click('[data-field="roiOn"]');
    expect(roi.dataset.on === 'false', 'roi toggle did not hide the panel');
    click('[data-field="roiOn"]');
    // language
    const monthly = card.dataset.monthly;
    const before = card.textContent;
    click('[data-lang="en"]');
    expect(card.textContent !== before && /LLM .* · tools .* · platform/.test(card.textContent) && card.dataset.monthly === monthly, 'EN switch changed numbers or did not translate');
    expect($('nav a[aria-current="page"]').getAttribute('href') === 'agent.html', 'nav current link wrong');
    click('[data-lang="pl"]');
    if (window.matchMedia('(max-width: 768px)').matches) {
      click('#settingsToggle');
      expect($('#app').dataset.settings === 'open', 'drawer did not open');
      click('#settingsBackdrop');
      expect($('#app').dataset.settings === 'closed', 'backdrop did not close the drawer');
    }
    const vp = viewport();
    setField('steps', 7);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true }));
    expect($('[data-field="steps"]').value === '6' && card.dataset.perRun === '0.0815', 'Alt+R did not reset');
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
AGENT_PLANT_HEAD = """<script>try { localStorage.setItem('edulab-aicalc-agent-v1', '{"hourlyRate":120,"reviewPct":50,"reviewMin":5,"manualMin":30,"runs":500,"roiOn":true}'); } catch (e) {}</script>"""
AGENT_PLANT_FLOW = r"""
<script>
(() => {
""" + PRELUDE + r"""
  try {
    expect(document.body.dataset.page === 'agent' && document.body.dataset.state === 'ready', 'old agent save did not render ready');
    expect($('[data-field="runs"]').value === '500', 'old agent save lost runs');
    const s = SubCore.loadState([SubCore.SHARED_FIELDS, SubCore.AGENT_FIELDS, SubCore.ROI_FIELDS], { runs: 500 }, SubCore.MODELS);
    const want = SubCore.computeAgentResults(s, SubCore.MODELS);
    expect($('#agentCard').dataset.monthly === SubUI.dataNum(want.monthly), `old agent save monthly ${$('#agentCard').dataset.monthly}, expected ${SubUI.dataNum(want.monthly)}`);
    expect($('#roiPanel').dataset.benefitMonthly === '5000', 'old agent save: benefit is not the default amount');
    setField('runs', 501);
    const saved = JSON.parse(localStorage.getItem('edulab-aicalc-agent-v1'));
    expect(saved.runs === 501 && !('hourlyRate' in saved) && !('manualMin' in saved) && !('reviewPct' in saved), 'the next save still carries removed keys');
    finish({ ok: true, assertions: assertions.n, viewport: viewport() });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
})();
</script>
"""

# A roi.html save from the time / amount mode era.
ROI_PLANT_HEAD = """<script>try { localStorage.setItem('edulab-aicalc-roi-v1', '{"benefitMode":"time","minPerDay":30,"adoption":80,"hourlyRate":120,"benefitMonthly":9000,"costMonthly":700}'); } catch (e) {}</script>"""
ROI_PLANT_FLOW = r"""
<script>
(() => {
""" + PRELUDE + r"""
  try {
    expect(document.body.dataset.page === 'roi' && document.body.dataset.state === 'ready', 'old roi save did not render ready');
    const panel = $('#roiPanel');
    expect(panel.dataset.benefitMonthly === '9000' && panel.dataset.costMonthly === '700', `old roi save: ${panel.dataset.benefitMonthly} / ${panel.dataset.costMonthly}`);
    finish({ ok: true, assertions: assertions.n, viewport: viewport() });
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error), assertions: assertions.n });
  }
})();
</script>
"""


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
        if key == "roi":
            # Bad prefill parameters never reach the state.
            label = f"{page} bad query http"
            nodes = parse(bs.run_browser(browser, f"{base}/{page}?cost=-5&oneOff=abc&users=0&verify=1", label), label)
            roi = nodes.get("#roiPanel", {})
            if roi.get("data-cost-monthly") != "1000":
                raise SmokeFailure(f"{label}: data-cost-monthly={roi.get('data-cost-monthly')!r}, expected '1000'")
            lines.append(f"{label}: defaults kept")

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


def run() -> list[str]:
    browser = bs.find_browser()
    lines: list[str] = []
    run_page(browser, "roi.html", "roi", ROI_FLOW, "?cost=1000&oneOff=25000", lines, head_flows=[("old-save", ROI_PLANT_FLOW, ROI_PLANT_HEAD)])
    run_page(browser, "seats.html", "seats", SEATS_FLOW, "", lines, head_flows=[("stale-state", SEATS_PLANT_FLOW, SEATS_PLANT_HEAD)])
    run_page(browser, "agent.html", "agent", AGENT_FLOW, "", lines, head_flows=[("old-save", AGENT_PLANT_FLOW, AGENT_PLANT_HEAD)])
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
