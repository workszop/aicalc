// roi.html: standalone return-on-investment page. Needs sub/core.js and sub/ui.js.
(function () {
// ─── Constants ───
const { SHARED_FIELDS, ROI_FIELDS, ROI_PAGE_FIELDS, MODELS } = SubCore;
const LS_KEY = 'edulab-aicalc-roi-v1';
const SCHEMAS = [SHARED_FIELDS, ROI_FIELDS, ROI_PAGE_FIELDS];

// ─── State ───
const state = Object.assign(SubUI.restore(LS_KEY, SCHEMAS, MODELS), SubCore.parseRoiQuery(location.search), { roiOn: true });
let fields = null;

// ─── DOM refs ───
const roiPanel = document.getElementById('roiPanel');
const settingsPanel = document.getElementById('settingsPanel');
const timeFields = document.getElementById('timeFields');
const amountFields = document.getElementById('amountFields');
const timeValue = document.getElementById('timeValue');

// ─── Helpers ───
function compute(s) {
  const benefitMonthly = s.benefitMode === 'amount' ? s.benefitMonthly : SubCore.timeBenefit(s);
  return SubCore.computeRoi({ costMonthly: s.costMonthly, benefitMonthly, oneOff: s.setup + s.training, ramp: s.ramp, horizon: s.horizon });
}
function pageChecks() {
  const roi = compute(state);
  return [
    ...SubUI.roiPanelChecks(roiPanel, state.horizon),
    { name: 'ROI page: panel matches computeRoi', pass: roiPanel.dataset.benefitMonthly === SubUI.dataNum(roi.benefitMonthly) && roiPanel.dataset.paybackMonth === (roi.paybackMonth === null ? '' : String(roi.paybackMonth)) },
    { name: 'ROI page: panel is on', pass: roiPanel.dataset.on === 'true' },
  ];
}

// ─── Render ───
function render() {
  const timeMode = state.benefitMode === 'time';
  timeFields.hidden = !timeMode;
  amountFields.hidden = timeMode;
  timeValue.textContent = SubUI.t('timeBenefitValue', { value: SubUI.money(SubCore.timeBenefit(state)) });
  SubUI.renderRoiPanel(roiPanel, compute(state), state);
}

// ─── Listeners ───
function onChange() {
  render();
  SubUI.persist(LS_KEY, state);
}
function reset() {
  Object.assign(state, SubCore.defaultsOf(...SCHEMAS), { roiOn: true });
  fields.sync();
  onChange();
}
SubUI.onLangChange(render);

// ─── Init ───
document.body.dataset.page = 'roi';
SubUI.renderNav('roi', { onReset: reset });
fields = SubUI.bindFields(settingsPanel, SCHEMAS, state, onChange);
render();
if (SubUI.isVerify()) SubUI.runChecks(pageChecks());
})();
