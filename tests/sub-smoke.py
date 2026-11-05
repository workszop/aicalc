#!/usr/bin/env python3
"""Chrome smoke test for the sub pages (roi.html, seats.html; agent joins later).

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
    // amount mode, 5000, ramp 3, horizon 12 -> payback in month 8
    click('[data-field="benefitMode"] [data-value="amount"]');
    expect($('[data-field="benefitMode"] [data-value="amount"]').getAttribute('aria-pressed') === 'true', 'amount mode not pressed');
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
    // language switch: caveat changes, numbers do not
    const before = { caveat: panel.querySelector('[data-roi="caveat"]').textContent, roi: panel.dataset.roiPct, pay: panel.dataset.paybackMonth };
    const axisBefore = panel.querySelector('svg [data-axis="x"]').textContent;
    click('[data-lang="en"]');
    const caveat = panel.querySelector('[data-roi="caveat"]').textContent;
    expect(document.documentElement.lang === 'en', 'html lang not en');
    expect(caveat !== before.caveat && /Time saved/.test(caveat), 'caveat did not switch to EN');
    expect(panel.querySelector('svg [data-axis="x"]').textContent !== axisBefore, 'chart axis label did not switch');
    expect(panel.dataset.roiPct === before.roi && panel.dataset.paybackMonth === before.pay, 'numbers changed on language switch');
    expect($('nav a[aria-current="page"]').getAttribute('href') === 'roi.html', 'nav current link wrong');
    // an invalid field in the inactive benefit mode must not block the other mode
    click('[data-field="benefitMode"] [data-value="time"]');
    setField('adoption', 500);
    expect(document.body.dataset.state === 'invalid', 'adoption 500 did not set invalid');
    click('[data-field="benefitMode"] [data-value="amount"]');
    expect(document.body.dataset.state === 'ready', 'invalid hidden time field still blocks amount mode');
    expect(!$('#amountFields').hidden && $('#timeFields').hidden, 'amount mode was not rendered');
    expect(panel.dataset.benefitMonthly === '5000', `amount mode benefit ${panel.dataset.benefitMonthly}, expected 5000`);
    click('[data-field="benefitMode"] [data-value="time"]');
    expect(document.body.dataset.state === 'invalid', 'back in time mode the invalid field must block again');
    expect(!$('#timeFields').hidden, 'time mode was not rendered');
    setField('adoption', 60);
    expect(document.body.dataset.state === 'ready', 'fixing adoption did not restore ready');
    click('[data-field="benefitMode"] [data-value="amount"]');
    expect(panel.dataset.paybackMonth === before.pay, 'payback changed after the mode round trip');
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
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true }));
    expect($('[data-field="benefitMode"] [data-value="time"]').getAttribute('aria-pressed') === 'true', 'Alt+R did not reset benefit mode');
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
    expect($('#verdict').getAttribute('aria-live') === 'polite' && /61/.test($('#verdict').textContent), 'verdict sentence missing');
    // roi panel follows the winner
    const roi = $('#roiPanel');
    const defaults = core.defaultsOf(...schemas);
    expect(roi.dataset.on === 'true', 'roi panel not on');
    expect(near(roi.dataset.costMonthly, num(card('api').dataset.monthly)), 'roi cost is not the winner monthly');
    expect(near(roi.dataset.benefitMonthly, core.timeBenefit(defaults)), 'roi benefit is not timeBenefit');
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
    expect(visibleOn(card('api').querySelector('.seat-warn')), 'seats warning has the same colour as its card background');
    setField('model', core.defaultsOf(core.SEAT_FIELDS).model);
    setField('inTok', 3000);
    setField('chatsPerDay', 0);
    expect(!/NaN|Infinity/.test($('#resultsPanel').textContent), 'zero chats produced NaN or Infinity');
    setField('inTok', 0); setField('outTok', 0);
    expect(cards.dataset.breakEvenChats === '' && !/NaN|Infinity/.test($('#resultsPanel').textContent), 'zero tokens must give an empty break-even and no NaN');
    expect(/nie wychodzi taniej/.test($('#verdict').textContent), 'no-break-even verdict missing');
    // roi toggle
    setField('inTok', 3000); setField('outTok', 700);
    click('[data-field="roiOn"]');
    expect(roi.dataset.on === 'false', 'roi toggle did not hide the panel');
    click('[data-field="roiOn"]');
    // language switch keeps numbers
    const monthly = card('sub').dataset.monthly;
    const verdictPl = $('#verdict').textContent;
    click('[data-lang="en"]');
    expect($('#verdict').textContent !== verdictPl && card('sub').dataset.monthly === monthly, 'EN switch changed numbers or did not translate');
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
    expect(document.body.dataset.state === 'ready', 'body[data-state] is not ready on load');
    expect(card && near(card.dataset.monthly, 1653.56), `monthly ${card && card.dataset.monthly}`);
    expect(card.dataset.perRun === '0.6768', `per run ${card.dataset.perRun}`);
    expect(card.dataset.eligible === 'true', 'default model not eligible');
    expect(roi.dataset.paybackMonth === '2', `payback month ${roi.dataset.paybackMonth}`);
    expect(roi.dataset.on === 'true', 'roi panel not on');
    const defaults = core.defaultsOf(core.SHARED_FIELDS, core.AGENT_FIELDS, core.ROI_FIELDS);
    const want = core.computeAgentResults(defaults, core.MODELS);
    expect(near(card.dataset.manualMonthly, want.manualMonthly) && near(roi.dataset.benefitMonthly, want.manualMonthly), 'manual / benefit differ from core');
    expect(near(roi.dataset.costMonthly, want.monthly), 'roi cost is not the agent monthly');
    expect(near(card.dataset.savedHours, want.savedHours), 'saved hours differ from core');
    expect($('#agentBars [data-bar="agent"]') && $('#agentBars [data-bar="manual"]'), 'bars missing');
    expect(/Obsługa maili|Raport|Faktury/.test($('#presets').textContent) && /przykład/.test($("#settingsPanel").textContent), 'presets or example label missing');
    // preset
    click('[data-preset="report"]');
    expect($('[data-field="runs"]').value === '20' && $('[data-field="steps"]').value === '12' && $('[data-field="manualMin"]').value === '90', 'report preset values wrong');
    expect($('[data-preset="report"]').getAttribute('aria-pressed') === 'true' && $('[data-preset="mail"]').getAttribute('aria-pressed') === 'false', 'preset aria-pressed wrong');
    setField('runs', 21);
    expect($('[data-preset="report"]').getAttribute('aria-pressed') === 'false', 'preset stays pressed after edit');
    click('[data-preset="mail"]');
    const mailWant = core.computeAgentResults(Object.assign({}, defaults, { runs: 3000, steps: 4, manualMin: 6 }), core.MODELS);
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
    expect(card.textContent !== before && /Manual/.test(card.textContent) && card.dataset.monthly === monthly, 'EN switch changed numbers or did not translate');
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
    expect($('[data-field="steps"]').value === '6' && card.dataset.perRun === '0.6768', 'Alt+R did not reset');
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
    run_page(browser, "roi.html", "roi", ROI_FLOW, "?cost=1000&oneOff=25000", lines)
    run_page(browser, "seats.html", "seats", SEATS_FLOW, "", lines, head_flows=[("stale-state", SEATS_PLANT_FLOW, SEATS_PLANT_HEAD)])
    run_page(browser, "agent.html", "agent", AGENT_FLOW, "", lines)
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
