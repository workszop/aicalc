// roi.html: standalone return-on-investment page. Needs sub/core.js and sub/ui.js.
(function () {
// ─── Constants ───
const { SHARED_FIELDS, ROI_FIELDS, ROI_PAGE_FIELDS, MODELS } = SubCore;
const LS_KEY = 'edulab-aicalc-roi-v1';
const SCHEMAS = [SHARED_FIELDS, ROI_FIELDS, ROI_PAGE_FIELDS];
SubUI.addStrings({
  pl: {
    roiPageTitle: 'Zwrot z inwestycji AI',
    roiLead: 'Po ilu miesiącach wdrożenie AI się zwraca? Wpisz koszt miesięczny, nakłady jednorazowe i spodziewaną korzyść.',
    groupCost: 'Koszt', costMonthly: 'Koszt miesięczny (PLN)', costHint: 'Abonamenty, API, utrzymanie. Kalkulatory subskrypcji i agenta podają tę kwotę.',
    groupBenefit: 'Korzyść',
    groupRollout: 'Wdrożenie i horyzont',
  },
  en: {
    roiPageTitle: 'AI return on investment',
    roiLead: 'How many months until an AI rollout pays for itself? Enter the monthly cost, the one-off outlays and the expected benefit.',
    groupCost: 'Cost', costMonthly: 'Monthly cost (PLN)', costHint: 'Subscriptions, API, upkeep. The seats and agent calculators give you this amount.',
    groupBenefit: 'Benefit',
    groupRollout: 'Rollout and horizon',
  },
});

// ─── State ───
const state = Object.assign(SubUI.restore(LS_KEY, SCHEMAS, MODELS), SubCore.parseRoiQuery(location.search), { roiOn: true });
let fields = null;

// ─── DOM refs ───
const roiPanel = document.getElementById('roiPanel');
const settingsPanel = document.getElementById('settingsPanel');

// ─── Helpers ───
function compute(s) {
  return SubCore.computeRoi({ costMonthly: s.costMonthly, benefitMonthly: s.benefitMonthly, oneOff: s.setup + s.training, ramp: s.ramp, horizon: s.horizon });
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
