// roi.html: standalone return-on-investment page. Needs sub/core.js and sub/ui.js.
(function () {
// ─── Constants ───
const { SHARED_FIELDS, ROI_FIELDS, ROI_PAGE_FIELDS, MODELS } = SubCore;
const LS_KEY = 'edulab-aicalc-roi-v1';
const SCHEMAS = [SHARED_FIELDS, ROI_FIELDS, ROI_PAGE_FIELDS];
const TIME_FIELDS = ['users', 'adoption', 'minPerDay', 'workDays', 'hourlyRate'];
SubUI.addStrings({
  pl: {
    roiPageTitle: 'Zwrot z inwestycji AI',
    roiLead: 'Po ilu miesiącach wdrożenie AI się zwraca? Wpisz koszt miesięczny, nakłady jednorazowe i spodziewaną korzyść.',
    groupCost: 'Koszt', costMonthly: 'Koszt miesięczny (PLN)', costHint: 'Abonamenty, API, utrzymanie. Kalkulatory subskrypcji i agenta podają tę kwotę.',
    groupBenefit: 'Korzyść', modeTime: 'Oszczędzony czas', modeAmount: 'Kwota miesięcznie',
    benefitMonthly: 'Korzyść miesięcznie (PLN)', timeBenefitValue: 'Oszczędzony czas jest wart {value} miesięcznie.',
    groupRollout: 'Wdrożenie i horyzont',
  },
  en: {
    roiPageTitle: 'AI return on investment',
    roiLead: 'How many months until an AI rollout pays for itself? Enter the monthly cost, the one-off outlays and the expected benefit.',
    groupCost: 'Cost', costMonthly: 'Monthly cost (PLN)', costHint: 'Subscriptions, API, upkeep. The seats and agent calculators give you this amount.',
    groupBenefit: 'Benefit', modeTime: 'Time saved', modeAmount: 'Amount per month',
    benefitMonthly: 'Benefit per month (PLN)', timeBenefitValue: 'The time saved is worth {value} per month.',
    groupRollout: 'Rollout and horizon',
  },
});

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
// The time-mode fields are inactive in amount mode and vice versa, so a bad value there never blocks the other mode.
function isActive(id, s) {
  if (id === 'benefitMonthly') return s.benefitMode === 'amount';
  return !TIME_FIELDS.includes(id) || s.benefitMode === 'time';
}
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
  // In amount mode the benefit is a sum of money, so the time caveat does not apply.
  SubUI.renderRoiPanel(roiPanel, compute(state), state, { caveat: timeMode });
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
fields = SubUI.bindFields(settingsPanel, SCHEMAS, state, onChange, { isActive });
render();
if (SubUI.isVerify()) SubUI.runChecks(pageChecks());
})();
