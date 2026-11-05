#!/usr/bin/env python3
"""Chrome smoke test for the sub pages (roi.html; seats/agent join later).

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
  node.dispatchEvent(new Event('input', { bubbles: true }));
};
const click = (sel) => { const n = $(sel); expect(n, `control ${sel} missing`); n.click(); };
const finish = (payload) => document.body.setAttribute('data-sub-smoke', encodeURIComponent(JSON.stringify(payload)));
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
def page_fixture(page: str, flow: str):
    """Yield a temporary copy of the repo's sub pages with ``flow`` injected into ``page``."""

    source = (ROOT / page).read_text(encoding="utf-8")
    if "</body>" not in source:
        raise SmokeFailure(f"{page}: no </body> to inject the flow before")
    with tempfile.TemporaryDirectory(prefix="aicalc-sub-fixture-") as directory:
        root = Path(directory)
        (root / page).write_text(source.replace("</body>", flow + "\n</body>", 1), encoding="utf-8")
        shutil.copytree(ROOT / "sub", root / "sub")
        if (ROOT / "assets").is_dir():
            shutil.copytree(ROOT / "assets", root / "assets")
        yield root


# ─── Runner ───
def run() -> list[str]:
    browser = bs.find_browser()
    lines: list[str] = []
    page = "roi.html"
    if not (ROOT / page).is_file():
        raise SmokeFailure(f"Repository has no {page}")

    with bs.local_server(ROOT) as server:
        base = f"http://127.0.0.1:{server.server_port}"
        for name, size in VIEWPORTS.items():
            url = f"{base}/{page}?verify=1"
            bs.probe_http(url)
            label = f"{page} verify http {name}"
            passed, total = check_verify(bs.run_browser(browser, url, label, window_size=size), label, "roi")
            lines.append(f"{label}: checks {passed}/{total}")
        # Bad prefill parameters never reach the state.
        label = f"{page} bad query http"
        nodes = parse(bs.run_browser(browser, f"{base}/{page}?cost=-5&oneOff=abc&users=0&verify=1", label), label)
        roi = nodes.get("#roiPanel", {})
        if roi.get("data-cost-monthly") != "1000":
            raise SmokeFailure(f"{label}: data-cost-monthly={roi.get('data-cost-monthly')!r}, expected '1000'")
        lines.append(f"{label}: defaults kept")

    file_url = f"{(ROOT / page).resolve().as_uri()}?verify=1"
    label = f"{page} verify file://"
    passed, total = check_verify(bs.run_browser(browser, file_url, label), label, "roi")
    lines.append(f"{label}: checks {passed}/{total}")

    with page_fixture(page, ROI_FLOW) as root:
        query = "?cost=1000&oneOff=25000"
        with bs.local_server(root) as server:
            for name, size in VIEWPORTS.items():
                label = f"{page} flow http {name}"
                url = f"http://127.0.0.1:{server.server_port}/{page}{query}"
                bs.probe_http(url)
                n = check_flow(bs.run_browser(browser, url, label, window_size=size), label)
                lines.append(f"{label}: {n} assertions")
        label = f"{page} flow file://"
        n = check_flow(bs.run_browser(browser, (root / page).resolve().as_uri() + query, label), label)
        lines.append(f"{label}: {n} assertions")
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
