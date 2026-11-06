// jak-placimy.html: three ways a company pays for AI. Explainer page, no settings.
// Example prices come from sub/core.js (the same data as the calculators), so they never drift apart.
(function () {
// ─── Constants ───
const { SHARED_FIELDS, SEAT_FIELDS, SEAT_PLANS, MODELS } = SubCore;
const EXAMPLE_CHAT = { inTok: 3000, outTok: 700 };
const HOURS_MONTH = 24 * 30.4;
SubUI.addStrings({
  pl: {
    payPageTitle: 'Jak płacimy za AI?',
    payLead: 'Firma, która chce używać AI, płaci na jeden z trzech sposobów: za aplikację, za korzystanie z modelu przez API albo za własną infrastrukturę. Każdy sposób ma inną jednostkę rozliczenia i inne koszty, o których łatwo zapomnieć.',
    payFigTitle: 'Za co płacimy, korzystając z AI',
    payStartTitle: 'Firma chce używać AI',
    payStartQuote: '„Za co właściwie zapłacimy?”',
    or: 'albo',
    optAppTitle: 'Używanie aplikacji', optAppCond: 'jeśli korzystamy z gotowego narzędzia',
    optAppEx1: 'ChatGPT, Claude, Gemini itp.', optAppEx2: 'Canva, Photoshop, SAP',
    optApiTitle: 'Korzystanie z modelu', optApiCond: 'jeśli łączymy się z modelem przez API',
    optApiEx1: 'API dostawcy (OpenAI, Anthropic, OpenRouter itp.)',
    optInfraTitle: 'Własna infrastruktura', optInfraCond: 'jeśli sami uruchamiamy model AI',
    optInfraEx1: 'chmura albo własny serwer', optInfraEx2: 'opcjonalnie licencja na model',
    payFigCaption: 'Ilustracja poglądowa: trzy modele płatności za AI w firmie. Kliknij wariant, żeby przejść do opisu.',
    kicker1: 'Sposób 1', kicker2: 'Sposób 2', kicker3: 'Sposób 3',
    optAppUnit: 'Płacisz za osobę, zwykle co miesiąc.',
    optApiUnit: 'Płacisz za tokeny, czyli za ilość tekstu.',
    optInfraUnit: 'Płacisz za sprzęt albo wynajem GPU, niezależnie od liczby rozmów.',
    factPay: 'Za co płacisz', factPrice: 'Przykładowe ceny', factGrows: 'Koszt rośnie, gdy', factHidden: 'Łatwo zapomnieć o', factWhen: 'Kiedy to dobry wybór',
    optAppPay: 'Abonament (licencję) dla każdej osoby, która ma konto. AI jest wbudowane w aplikację: w czat, edytor grafiki albo system firmowy. Dostawca ustala limity użycia w ramach planu.',
    optAppGrows: 'przybywa osób z kontem, nawet jeśli część z nich korzysta rzadko, albo gdy potrzebny jest wyższy plan z funkcjami firmowymi.',
    optAppHidden: 'licencje, których wymaga dana aplikacja (np. Microsoft 365 dla Copilota), szkolenia i nieużywane konta.',
    optAppWhen: 'ludzie korzystają często i samodzielnie, a firma nie chce niczego budować ani utrzymywać.',
    optApiPay: 'Każde zapytanie do modelu: osobno za tekst, który model czyta (tokeny wejścia), i za tekst, który pisze (tokeny wyjścia). Ceny podaje się w USD za milion tokenów, a pisanie jest kilka razy droższe od czytania.',
    optApiGrows: 'rośnie liczba zapytań, długość kontekstu (dokumenty, historia rozmowy) i liczba kroków agenta. Droższy model może kosztować kilkadziesiąt razy więcej.',
    optApiHidden: 'własną aplikację albo integrację, hosting, logowanie, przechowywanie rozmów, ponowienia po błędach i narzędzia, z których korzysta agent.',
    optApiWhen: 'AI ma działać wewnątrz własnego procesu lub produktu, np. agent obsługujący maile, albo użycie jest nierówne i chcesz płacić tylko za to, co faktycznie wysłano.',
    optInfraPay: 'Zakup serwera z GPU (rozłożony na raty) albo wynajem GPU w chmurze rozliczany za godzinę. Do tego prąd, obsługa techniczna i czasem licencja na model.',
    optInfraGrows: 'potrzeba więcej mocy: więcej osób naraz, większy model albo dłuższe dokumenty. Sama liczba rozmów nie zmienia kosztu, dopóki wystarcza sprzętu.',
    optInfraHidden: 'osobę techniczną, aktualizacje, bezpieczeństwo i kopie zapasowe. Otwarte modele są często bezpłatne (np. na licencji Apache 2.0), ale część wymaga umowy przy użyciu komercyjnym.',
    optInfraWhen: 'dane nie mogą opuścić firmy albo zespół korzysta dużo i równo przez cały miesiąc, tak że stały koszt sprzętu się zwraca.',
    priceApp: '{plans} za osobę miesięcznie, czyli ok. {pln} przy kursie {fx}.',
    priceAppNote: '{plan}: {note}',
    priceApi: 'Od {cheap}: {cheapIn} / {cheapOut} USD do {dear}: {dearIn} / {dearOut} USD za milion tokenów wejścia / wyjścia.',
    priceApiChat: 'Jedna rozmowa ({inTok} tokenów wejścia, {outTok} wyjścia) na modelu {model} kosztuje ok. {chat}.',
    priceInfra: 'Serwer z układem NVIDIA GB10: ok. {capex} jednorazowo, czyli {rate} miesięcznie przy {months} mies. amortyzacji, plus prąd ok. {power} miesięcznie ({watts} W całą dobę).',
    priceInfraCloud: 'Wynajem GPU w chmurze jest rozliczany za godzinę pracy karty; kalkulator RAG porównuje go z serwerem.',
    linkSeats: 'Policz: Subskrypcje vs API →', linkAgent: 'Policz: agent →', linkRag: 'Policz: asystent RAG →',
    linkRagInfra: 'Policz: chmura, GB10, własny serwer →', linkSeatsLocal: 'Porównaj z subskrypcją →',
    compareTitle: 'Porównanie w skrócie', thAspect: 'Cecha',
    rowUnit: 'Jednostka rozliczenia', rowShape: 'Charakter kosztu', rowStart: 'Start', rowWho: 'Kto utrzymuje', rowData: 'Gdzie trafiają dane', rowModel: 'Wybór modelu',
    cmpAppUnit: 'osoba / miesiąc', cmpApiUnit: 'milion tokenów', cmpInfraUnit: 'serwer albo godzina GPU',
    cmpAppShape: 'stały, rośnie z liczbą kont', cmpApiShape: 'zmienny, rośnie z użyciem', cmpInfraShape: 'głównie stały, skokowo przy nowym sprzęcie',
    cmpAppStart: 'od razu', cmpApiStart: 'dni lub tygodnie (integracja)', cmpInfraStart: 'tygodnie (zakup, instalacja)',
    cmpAppWho: 'dostawca aplikacji', cmpApiWho: 'dostawca modelu; ty aplikację', cmpInfraWho: 'ty',
    cmpAppData: 'do dostawcy aplikacji', cmpApiData: 'do dostawcy modelu', cmpInfraData: 'zostają w firmie albo w twojej chmurze',
    cmpAppModel: 'ten, który daje dostawca', cmpApiModel: 'dowolny model dostawcy, łatwo zmienić', cmpInfraModel: 'otwarte modele, które mieszczą się na sprzęcie',
    compareNote: 'Sposoby można łączyć: wiele firm kupuje aplikację dla zespołu, a API do jednego zautomatyzowanego procesu.',
    pricesChecked: 'Ceny planów sprawdzone {seats}, ceny modeli sprawdzone {models}. Kwoty netto, bez VAT; to szacunki, nie oferta.',
    payShortcuts: 'Skróty: L zmienia język',
    needsM365: 'Wymaga licencji Microsoft 365.',
    checkCards: 'Pay: trzy karty mają przykładowe ceny', checkDiagram: 'Pay: schemat ma trzy warianty i linki do kart',
    checkCore: 'Pay: ceny zgadzają się z rdzeniem', checkLinks: 'Pay: linki prowadzą do kalkulatorów',
  },
  en: {
    payPageTitle: 'How we pay for AI',
    payLead: 'A company that wants to use AI pays in one of three ways: for an app, for using a model through the API, or for its own infrastructure. Each way has a different billing unit and different costs that are easy to forget.',
    payFigTitle: 'What we pay for when using AI',
    payStartTitle: 'A company wants to use AI',
    payStartQuote: '“What exactly will we pay for?”',
    or: 'or',
    optAppTitle: 'Using an app', optAppCond: 'if we use a ready-made tool',
    optAppEx1: 'ChatGPT, Claude, Gemini etc.', optAppEx2: 'Canva, Photoshop, SAP',
    optApiTitle: 'Using a model', optApiCond: 'if we connect to a model through the API',
    optApiEx1: 'Provider API (OpenAI, Anthropic, OpenRouter etc.)',
    optInfraTitle: 'Own infrastructure', optInfraCond: 'if we run the AI model ourselves',
    optInfraEx1: 'cloud or own server', optInfraEx2: 'optionally a model licence',
    payFigCaption: 'Illustration: three ways a company pays for AI. Click an option to jump to its description.',
    kicker1: 'Way 1', kicker2: 'Way 2', kicker3: 'Way 3',
    optAppUnit: 'You pay per person, usually monthly.',
    optApiUnit: 'You pay for tokens, i.e. for the amount of text.',
    optInfraUnit: 'You pay for hardware or rented GPUs, regardless of the number of chats.',
    factPay: 'What you pay for', factPrice: 'Example prices', factGrows: 'The cost grows when', factHidden: 'Easy to forget', factWhen: 'When it is a good choice',
    optAppPay: 'A subscription (licence) for every person with an account. The AI is built into the app: a chat, an image editor or a company system. The provider sets usage limits within the plan.',
    optAppGrows: 'more people get accounts, even if some rarely use them, or a higher plan with business features is needed.',
    optAppHidden: 'licences the app requires (e.g. Microsoft 365 for Copilot), training and unused accounts.',
    optAppWhen: 'people use it often and on their own, and the company does not want to build or maintain anything.',
    optApiPay: 'Every request to the model: separately for the text the model reads (input tokens) and the text it writes (output tokens). Prices are given in USD per million tokens, and writing costs several times more than reading.',
    optApiGrows: 'the number of requests, the context length (documents, chat history) and the number of agent steps grow. A pricier model can cost dozens of times more.',
    optApiHidden: 'your own app or integration, hosting, sign-in, chat storage, retries after errors and the tools an agent uses.',
    optApiWhen: 'AI must work inside your own process or product, e.g. an agent handling e-mail, or usage is uneven and you want to pay only for what was actually sent.',
    optInfraPay: 'Buying a GPU server (spread into instalments) or renting cloud GPUs billed by the hour. Plus electricity, technical upkeep and sometimes a model licence.',
    optInfraGrows: 'more capacity is needed: more people at once, a bigger model or longer documents. The number of chats alone does not change the cost while the hardware keeps up.',
    optInfraHidden: 'a technical person, updates, security and backups. Open models are often free (e.g. under the Apache 2.0 licence), but some require an agreement for commercial use.',
    optInfraWhen: 'data must not leave the company, or the team uses it a lot and evenly through the month, so the fixed hardware cost pays off.',
    priceApp: '{plans} per person per month, i.e. about {pln} at a rate of {fx}.',
    priceAppNote: '{plan}: {note}',
    priceApi: 'From {cheap}: {cheapIn} / {cheapOut} USD to {dear}: {dearIn} / {dearOut} USD per million input / output tokens.',
    priceApiChat: 'One chat ({inTok} input tokens, {outTok} output) on {model} costs about {chat}.',
    priceInfra: 'A server with an NVIDIA GB10 chip: about {capex} one-off, i.e. {rate} per month over {months} months, plus about {power} of electricity per month ({watts} W around the clock).',
    priceInfraCloud: 'Cloud GPU rental is billed per GPU hour; the RAG calculator compares it with a server.',
    linkSeats: 'Calculate: seats vs API →', linkAgent: 'Calculate: agent →', linkRag: 'Calculate: RAG assistant →',
    linkRagInfra: 'Calculate: cloud, GB10, own server →', linkSeatsLocal: 'Compare with a subscription →',
    compareTitle: 'Comparison at a glance', thAspect: 'Aspect',
    rowUnit: 'Billing unit', rowShape: 'Cost shape', rowStart: 'Start', rowWho: 'Who maintains it', rowData: 'Where the data goes', rowModel: 'Choice of model',
    cmpAppUnit: 'person / month', cmpApiUnit: 'million tokens', cmpInfraUnit: 'server or GPU hour',
    cmpAppShape: 'fixed, grows with accounts', cmpApiShape: 'variable, grows with use', cmpInfraShape: 'mostly fixed, steps up with new hardware',
    cmpAppStart: 'immediately', cmpApiStart: 'days or weeks (integration)', cmpInfraStart: 'weeks (purchase, setup)',
    cmpAppWho: 'the app provider', cmpApiWho: 'the model provider; you run the app', cmpInfraWho: 'you',
    cmpAppData: 'to the app provider', cmpApiData: 'to the model provider', cmpInfraData: 'stays in the company or your cloud',
    cmpAppModel: 'whatever the provider offers', cmpApiModel: 'any provider model, easy to switch', cmpInfraModel: 'open models that fit the hardware',
    compareNote: 'The ways can be combined: many companies buy an app for the team and use the API for one automated process.',
    pricesChecked: 'Plan prices checked {seats}, model prices checked {models}. Net amounts, excluding VAT; estimates, not a quote.',
    payShortcuts: 'Shortcuts: L switches the language',
    needsM365: 'Requires a Microsoft 365 licence.',
    checkCards: 'Pay: three cards carry example prices', checkDiagram: 'Pay: the diagram has three options linked to the cards',
    checkCore: 'Pay: prices match the core', checkLinks: 'Pay: links lead to the calculators',
  },
});

// ─── State ───
const fx = SHARED_FIELDS.fx.def;

// ─── DOM refs ───
const priceNodes = { app: document.querySelector('[data-price="app"]'), api: document.querySelector('[data-price="api"]'), infra: document.querySelector('[data-price="infra"]') };
const checkedNote = document.getElementById('pricesChecked');

// ─── Helpers ───
const t = SubUI.t;
const usd = (v) => SubUI.fmtNum(v, v % 1 ? 2 : 0);
const latest = (list) => list.map((x) => x.checkedAt).sort().slice(-1)[0] || '';
function facts() {
  const plans = SEAT_PLANS.slice().sort((a, b) => a.usd - b.usd);
  const byIn = MODELS.slice().sort((a, b) => a.pin - b.pin || a.pout - b.pout);
  const cheap = byIn[0];
  const dear = byIn[byIn.length - 1];
  const chatModel = MODELS.find((m) => m.name === SEAT_FIELDS.model.def) || cheap;
  const chat = SubCore.chatCost(chatModel, { docLang: 'pl', fx }, EXAMPLE_CHAT.inTok, EXAMPLE_CHAT.outTok).perCall;
  const gb = { capex: SEAT_FIELDS.localCapex.def, months: SEAT_FIELDS.localAmort.def, watts: SEAT_FIELDS.localPower.def, kwh: SEAT_FIELDS.kwh.def };
  return { plans, cheap, dear, chatModel, chat, gb, gbRate: gb.capex / gb.months, gbPower: gb.watts / 1000 * HOURS_MONTH * gb.kwh };
}

// ─── Render ───
function renderPrices() {
  const f = facts();
  const minUsd = f.plans[0].usd;
  const app = priceNodes.app;
  app.replaceChildren(
    SubUI.el('span', {}, t('priceApp', { plans: f.plans.map((p) => `${p.name} ${usd(p.usd)} USD`).join(', '), pln: SubUI.money(minUsd * fx), fx: SubUI.fmtNum(fx, 2) })),
    ...f.plans.filter((p) => p.noteKey).map((p) => SubUI.el('span', { class: 'pay-sub' }, t('priceAppNote', { plan: p.name, note: t(p.noteKey) }))));
  Object.assign(app.dataset, { minUsd: SubUI.dataNum(minUsd), maxUsd: SubUI.dataNum(f.plans[f.plans.length - 1].usd) });
  const api = priceNodes.api;
  api.replaceChildren(
    SubUI.el('span', {}, t('priceApi', { cheap: f.cheap.name, cheapIn: usd(f.cheap.pin), cheapOut: usd(f.cheap.pout), dear: f.dear.name, dearIn: usd(f.dear.pin), dearOut: usd(f.dear.pout) })),
    SubUI.el('span', { class: 'pay-sub' }, t('priceApiChat', { inTok: SubUI.fmtNum(EXAMPLE_CHAT.inTok), outTok: SubUI.fmtNum(EXAMPLE_CHAT.outTok), model: f.chatModel.name, chat: SubUI.money(f.chat, 4) })));
  Object.assign(api.dataset, { cheapModel: f.cheap.name, dearModel: f.dear.name, chatPln: SubUI.dataNum(f.chat, 4) });
  const infra = priceNodes.infra;
  infra.replaceChildren(
    SubUI.el('span', {}, t('priceInfra', { capex: SubUI.money(f.gb.capex), rate: SubUI.money(f.gbRate), months: SubUI.fmtNum(f.gb.months), power: SubUI.money(f.gbPower), watts: SubUI.fmtNum(f.gb.watts) })),
    SubUI.el('span', { class: 'pay-sub' }, t('priceInfraCloud')));
  Object.assign(infra.dataset, { gbMonthly: SubUI.dataNum(f.gbRate + f.gbPower) });
  checkedNote.textContent = t('pricesChecked', { seats: latest(SEAT_PLANS), models: latest(MODELS) });
}
function render() {
  renderPrices();
  document.body.dataset.state = 'ready';
}
function pageChecks() {
  const f = facts();
  const cards = [...document.querySelectorAll('.pay-card')];
  const nodes = [...document.querySelectorAll('#payDiagram .pay-node[data-accent]')];
  const linksOk = nodes.every((n) => { const a = n.querySelector('a[href^="#"]'); return a && document.querySelector(a.getAttribute('href')); });
  const calcLinks = [...document.querySelectorAll('.pay-links a')].map((a) => a.getAttribute('href'));
  return [
    { name: t('checkCards'), pass: cards.length === 3 && cards.every((c) => c.querySelector('.pay-price').textContent.trim().length > 0) },
    { name: t('checkDiagram'), pass: nodes.length === 3 && linksOk },
    { name: t('checkCore'), pass: priceNodes.app.dataset.minUsd === SubUI.dataNum(f.plans[0].usd) && priceNodes.api.dataset.chatPln === SubUI.dataNum(f.chat, 4) && priceNodes.infra.dataset.gbMonthly === SubUI.dataNum(f.gbRate + f.gbPower) },
    { name: t('checkLinks'), pass: calcLinks.length > 0 && calcLinks.every((h) => ['index.html', 'seats.html', 'agent.html'].includes(h)) },
  ];
}

// ─── Listeners ───
SubUI.onLangChange(render);

// ─── Init ───
SubUI.renderNav('pay', { tools: false });
render();
if (SubUI.isVerify()) SubUI.runChecks(pageChecks());
})();
