# aicalc – kalkulator kosztów AI

Jednoplikowy kalkulator edukacyjny porównujący miesięczny koszt asystenta RAG w
czterech wariantach:

1. płatne API modelu (plus stała infrastruktura wokół API),
2. GPU w chmurze,
3. **małe wdrożenie na Dell Pro Max GB10** – pakiet wyceniony na **35 000 PLN**,
4. własny serwer (RTX PRO 6000).

Nad infrastrukturą liczona jest warstwa **oprogramowania RAG** (neutralna etykieta, edytowalne kwoty):
przy API i chmurze jako SaaS (domyślnie 5 000 PLN / mies. w obu), przy Dell
GB10 i własnym serwerze jako sprzedaż licencji (150 000 PLN jednorazowo,
amortyzowane przez 36 mies.) z rocznym kontraktem wsparcia (20 000 PLN / rok).
Każda karta pokazuje sumę oraz podział „Oprogramowanie · Infrastruktura”;
na wykresie narastającym licencja płatna jest w miesiącu 0 i nie powtarza się
przy wymianie sprzętu.

To **szacunek kosztu inferencji**, a nie oferta, wycena wdrożenia ani gwarancja
jakości lub przepustowości. Wszystkie kwoty są netto, bez VAT.

## Funkcje dodane 2026-10-21

- Przełącznik **„Uwzględnij koszt oprogramowania AI”** (`softwareOn`, domyślnie
  włączony) wyłącza warstwę oprogramowania RAG we wszystkich opcjach; wartość jest
  częścią scenariusza (JSON, link) i kontraktu DOM (`data-software-on`).
- **Werdykt** jednym zdaniem nad kartami (`#verdict`, `data-verdict-winner`,
  `data-verdict-recommended`, `data-verdict-savings-pct`) oraz wnioski zapisane
  jako zdania.
- Scenariusz (wartości i wczytany cennik CSV) zapisuje się automatycznie w
  localStorage przeglądarki i wraca po odświeżeniu; „Reset scenariusza” w
  nagłówku przywraca domyślne.
- Pomoc pod polami, słowniczek, pasek bieżących sum przy przewijaniu, skok z
  komunikatu walidacji do pola, kolumna „Sprawdzono” ze źródłem cen w tabeli
  modeli, znaczniki przecięć kosztów na wykresie (`data-crossovers`).

## Uruchomienie

Projekt nie ma buildu ani zależności npm. Otwórz
[`/home/andrzey/git-claude/aicalc/index.html`](/home/andrzey/git-claude/aicalc/index.html) bezpośrednio w
przeglądarce (`file://`) albo uruchom opcjonalny serwer:

```bash
cd /home/andrzey/git-claude/aicalc
python3 -m http.server 8000
```

Następnie otwórz <http://127.0.0.1:8000/index.html>.

Wersja online: <https://workszop.github.io/aicalc/>. Strony z sekcji
„Kalkulatory dodatkowe” pojawią się pod tym samym adresem po wdrożeniu gałęzi.

## Kalkulatory dodatkowe

Obok kalkulatora RAG (`index.html`) są dwie strony pomocnicze. Wszystkie
działają tak samo jak główna: bez buildu, z `file://`, z przełącznikiem PL/EN
i z paskiem nawigacji w nagłówku. Wersje online (po wdrożeniu gałęzi, na razie
jeszcze niedostępne):

- <https://workszop.github.io/aicalc/seats.html>
- <https://workszop.github.io/aicalc/agent.html>

Wspólne założenia: kwoty są szacunkami, w PLN netto (bez VAT); kurs `fx` =
3,73 PLN/USD, `workDays` = 250 dni w roku,
`users` = 20. Żadna strona nie wycenia czasu pracy ludzi: nie ma stawki
godzinowej ani porównania z pracą ręczną. Ceny modeli i współczynniki tokenów
pochodzą z tej samej migawki co `index.html` (pilnuje tego
`tests/sub-sync.test.cjs`).

### Subskrypcje vs API vs lokalnie

Strona `seats.html`: ile kosztuje zespół, gdy każdy ma płatne miejsce
(subskrypcję), gdy używa się API przez własny interfejs czatu albo gdy model
działa lokalnie na sprzęcie firmy.

Wzory (miesięcznie):

- subskrypcje: `users × cena_miejsca_USD × fx`,
- API: `users × (chatsPerDay × workDays / 12) × koszt_jednego_czatu + uiOps`,
  gdzie koszt czatu to `(inTok × cena_wejścia + outTok × cena_wyjścia) / 1M × fx`
  (tokeny przeliczone współczynnikiem rodziny modelu i języka dokumentów),
- lokalnie: `ceil(users / localMaxUsers) × (localCapex / localAmort +
  localPower / 1000 × 24 × 30,4 × kwh) + localOps + uiOps`,
- punkt przecięcia: liczba czatów dziennie na osobę, od której subskrypcja
  jest tańsza niż API. Ma jeden z trzech rodzajów (`data-break-even-kind`):
  `from` – subskrypcja jest tańsza od podanej liczby rozmów
  (`data-break-even-chats`), `always` – jest tańsza przy każdym użyciu (cena
  miejsca nie przekracza utrzymania czatu na osobę), `never` – nigdy nie jest
  tańsza, bo rozmowy przez API nic nie kosztują i zostaje samo `uiOps`. Gdy
  model API nie mieści rozmowy, zdanie o progu znika z werdyktu.

| Parametr | Domyślnie |
| --- | --- |
| `plan` | ChatGPT Business (lub inny plan z listy, lub własna cena `customUsd` = 30 USD) |
| `chatsPerDay` | 15 |
| `inTok` / `outTok` | 3 000 / 700 tokenów na czat |
| `model` | OpenAI GPT-5.6 Terra |
| `uiOps` | 500 PLN / mies. (interfejs czatu przy API i lokalnie) |
| `localCapex` / `localAmort` | 35 000 PLN / 36 mies. |
| `localPower` / `kwh` | 240 W / 1,00 PLN za kWh |
| `localOps` | 0 PLN / mies. |
| `localMaxUsers` | 100 użytkowników na jednostkę |

Ceny miejsc, sprawdzone **2026-11-05** (USD za miejsce za miesiąc, rozliczenie
miesięczne, bez VAT):

| Plan | Cena | Źródło |
| --- | --- | --- |
| ChatGPT Business | 25 USD | <https://help.openai.com/en/articles/8792828-chatgpt-business-overview> |
| Microsoft 365 Copilot | 25,2 USD | <https://www.microsoft.com/en-us/copilot/pricing/business> |
| Claude Team | 25 USD | <https://claude.com/pricing> |

Microsoft 365 Copilot wymaga bazowej licencji Microsoft 365, której cena nie
jest tu doliczana (strona pokazuje o tym osobną uwagę).

Zastrzeżenia: to szacunki, nie oferta; ceny listowe zmieniają się, a plany
mają limity użycia i funkcje, których kalkulator nie porównuje; kwoty netto w
PLN; przepustowość GB10 (`localMaxUsers`) nie została sprawdzona na stronie
miejsc – to założenie, które trzeba zmierzyć na własnym modelu.

### Agent / automatyzacja

Strona `agent.html`: koszt agenta, który wykonuje zadania w kilku krokach
(wywołaniach modelu) i korzysta z narzędzi.

Wzory:

- koszt modelu na zadanie: `kroki × koszt_jednego_kroku × (1 + retryPct / 100)`,
- narzędzia na zadanie: `toolPln`,
- koszt zadania = model + narzędzia; miesięcznie: `runs × koszt_zadania + platform`
  (domyślnie 0,0815 PLN na zadanie i 463,02 PLN / mies.),
- pod wynikiem strona opisuje w pięciu krokach, co agent robi w jednym
  uruchomieniu (zadanie, decyzja modelu, narzędzie, wynik, pętla); to
  ogólny opis pętli, nie konkretnego zadania.

Gotowe scenariusze ustawiają tylko `runs` i `steps`: obsługa maili 3 000 / 4,
raport sprzedaży 20 / 12, faktury 800 / 5.

| Parametr | Domyślnie |
| --- | --- |
| `model` | OpenAI GPT-5.6 Luna |
| `runs` | 2 000 zadań / mies. |
| `steps` | 6 kroków na zadanie |
| `inTok` / `outTok` | 4 000 / 400 tokenów na krok |
| `retryPct` | 10% (powtórzenia) |
| `toolPln` | 0,05 PLN na zadanie |
| `platform` | 300 PLN / mies. |

Zastrzeżenia: liczba kroków i tokenów mocno zależy od konkretnego agenta –
wartości domyślne są ilustracyjne.

### Pliki w `sub/`

| Plik | Zawartość |
| --- | --- |
| `sub/core.js` | czysty rdzeń bez DOM: ceny modeli, plany miejsc (`SEAT_PLANS`), schematy pól, `computeSeatResults`, `computeAgentResults` |
| `sub/ui.js` | wspólna warstwa interfejsu: słownik PL/EN, nawigacja, panel ustawień, kontrakt DOM |
| `sub/seats.js` | logika strony `seats.html` |
| `sub/agent.js` | logika strony `agent.html` |
| `sub/sub.css` | wspólne style stron pomocniczych (tokeny w `:root`) |

## Małe wdrożenie: Dell GB10

Trzecia ścieżka liczy się tym samym modelem co własny serwer (amortyzacja
zakupu + prąd + stała obsługa; na wykresie kolejny zakup co okres wymiany).
Domyślne parametry są edytowalne w panelu ustawień:

| Parametr | Domyślnie | Uwaga |
| --- | --- | --- |
| `smallCapex` | 35 000 PLN | cena pakietu Dell GB10 z konfiguracją |
| `smallAmort` / `smallReplace` | 36 mies. | amortyzacja i wymiana rozliczane osobno |
| `smallOps` | 0 PLN / mies. | utrzymanie sprzętu nie jest liczone (wsparcie jest w kontrakcie wsparcia oprogramowania) |
| `smallPower` | 240 W | pobór stacji GB10, pełna moc 24/7 jako górna granica |
| `smallPrefill` / `smallDecode` | 3 000 / 250 tok/s | ilustracyjne; pamięć ~273 GB/s ogranicza generowanie |

Parametry oprogramowania (sekcja „Oprogramowanie RAG”):
`softApi` 5 000, `softCloud` 5 000 PLN / mies., `softLicense` 150 000 PLN,
`softSupport` 20 000 PLN / rok, `softAmort` 36 mies. Przy API doliczana jest
stała infrastruktura `apiOps` (domyślnie 1 000 PLN / mies.: hosting aplikacji,
baza wektorowa, sieć); kwoty w tabeli modeli zawierają SaaS i tę
infrastrukturę. Koszty obsługi sprzętu (`cloudOps`, `ownOps`, `smallOps`) domyślnie
wynoszą 0.

Opcja jest przeznaczona dla małych wdrożeń: do **100 użytkowników** włącznie
(`smallMaxUsers` = 100) GB10 bierze udział w porównaniu; od 101 karta, pasek
w podsumowaniu i legenda wykresu oznaczają GB10 jako „Niedostępne” (karta
zostaje, bez kwoty, z linkiem do zmiany liczby użytkowników). Poniżej limitu, gdy szczyt przekracza zadany limit wykorzystania,
kalkulator dolicza kolejne sztuki GB10. Wartości przepustowości trzeba
zmierzyć na własnym modelu przed decyzją.

Od **50 użytkowników** (`smallRecommendFrom`, edytowalne), gdy GB10 jest
najtańszy, karta GB10 zachowuje etykietę „Najtańsze”, a kolejna najtańsza
opcja dostaje etykietę „Rekomendowane” (`data-recommended` na karcie i
`#app[data-recommended]`). Poniżej progu, albo gdy GB10 nie wygrywa,
rekomendacja nie jest pokazywana.

## Dobór sprzętu do liczby użytkowników

W ustawieniach zaawansowanych parametr `maxUtilization` ustala maksymalne
wykorzystanie sprzętu (1–100%, domyślnie **80%**). Domyślnie zostaje więc
co najmniej 20% rezerwy obliczeniowej przy szacowanym szczycie. Kalkulator
sumuje obciążenie wejścia i wyjścia, dzieli je przez limit wykorzystania
i zaokrągla w górę do pełnych jednostek. Przy zerowym ruchu pozostaje jedna
jednostka, z jej normalnymi kosztami.

Jednostka oznacza kompletną konfigurację: instancję GPU w chmurze, własny
serwer albo stację GB10. Cena, moc i przepustowość w ustawieniach dotyczą
jednej takiej jednostki. Kolejne jednostki zwiększają koszt najmu albo
zakupu, amortyzacji, energii i wymiany sprzętu; stałe koszty obsługi oraz
oprogramowania nie są mnożone. Zmiana samego opisu GPU nie zmienia parametrów.

Karty pokazują liczbę jednostek, wykorzystanie w szczycie, limit oraz
szacowaną liczbę obsługiwanych i dodatkowych użytkowników. Pojemność dotyczy
bieżącego profilu na osobę (zapytania, kontekst, odpowiedź, język, myślenie,
godziny i szczyt), **nie liczby jednoczesnych sesji**. Przy braku obciążenia
tokenami pojemność z przepustowości nie jest wyznaczana. Limit wdrożenia GB10
pozostaje niezależny i obowiązuje także wtedy.

Przykłady przy pozostałych ustawieniach domyślnych:

| Użytkownicy | Chmura GPU | Własny serwer | GB10 |
| --- | --- | --- | --- |
| 20 | 1 instancja | 1 serwer | 1 stacja |
| 50 | 1 instancja | 1 serwer | 1 stacja |
| 100 | 1 instancja | 1 serwer | 2 stacje |
| 101 | 1 instancja | 1 serwer | niedostępne |
| 400 | 2 instancje | 2 serwery | niedostępne |

Przy 400 użytkownikach dwie instancje chmurowe obsługują szacunkowo do
740 osób, czyli zostaje miejsce na 340 dodatkowych użytkowników o tym samym
profilu. Ustawienie limitu 100% wyłącza rezerwę i przywraca wcześniejszy
model doboru liczby jednostek. To nadal szacunek: aplikacja nie weryfikuje
VRAM, dopasowania modelu do sprzętu ani opóźnień. Przed zakupem lub najmem
potrzebny jest test obciążeniowy własnej konfiguracji.

## Scenariusze i cennik

  przeglądarki (klucz `edulab-aicalc-scenario-v2`; scenariusze zapisane przez
  poprzednią wersję nie są odczytywane, bo nie mają pól GB10). Zapisany
  scenariusz jest odczytywany przy kolejnym starcie.
  Język PL/EN jest zapisywany niezależnie; ostatnia preferencja językowa ma
  pierwszeństwo przed językiem zapisanym w scenariuszu. Import również
  zachowuje wybraną preferencję.
- **Eksport JSON** i **Import JSON** pozwalają przenieść scenariusz między
  przeglądarkami. Import jest walidowany przed zastosowaniem.
- Limit wykorzystania i próg rekomendacji są zapisywane i eksportowane wraz
  ze scenariuszem. Starsze pliki bez `maxUtilization` otrzymują wartość 80%,
  a bez `smallRecommendFrom` wartość 50; ich wyniki mogą więc wymagać większej
  liczby jednostek niż wcześniej.
- **Reset scenariusza** przywraca ustawienia kalkulatora i od razu zapisuje
  reset. Aktualny, zaimportowany cennik pozostaje zachowany.
- **Cennik wbudowany** to osobny reset CSV: przywraca wyłącznie listę modeli
  dostarczoną z aplikacją. Jeśli ma być zachowana po ponownym uruchomieniu,
  zapisz scenariusz lokalnie.

## Układ interfejsu

Na dużym ekranie ustawienia są zebrane w niezależnie przewijanym panelu po
lewej stronie. Panel obejmuje obciążenie (widoczne są trzy scenariusze,
szczegóły zwinięte), oprogramowanie RAG, model API, chmurę GPU,
Dell GB10, własny serwer,
ustawienia zaawansowane oraz operacje scenariusza. Po prawej stronie pozostają
wyniki, wykresy i porównanie modeli, więc zmiana parametrów nie wypycha
wyników poza ekran.

Cztery karty wyników pokazują od razu kwoty miesięczne. Przycisk **Szczegóły kosztów**
rozwija rozbicie kosztów, dzięki czemu wykresy pozostają wyżej na stronie.

Na ekranach o szerokości do 768 px panel staje się wysuwanym panelem ustawień.
Otwiera go przycisk **Ustawienia**; można go zamknąć przyciskiem w nagłówku,
kliknięciem tła albo klawiszem `Escape`. Stan panelu nie zmienia obliczeń i nie
jest zapisywany w scenariuszu.

Import cennika zastępuje całą listę modeli. Plik może mieć najwyżej **100
modeli** i **1 MiB**. Nie zapisujemy kluczy API ani danych poza przeglądarką.

### Schemat CSV modeli

Wzór dostępny w aplikacji przyciskiem „Pobierz wzór CSV” używa kodowania UTF-8,
przecinka jako separatora oraz standardowego cudzysłowu CSV (`"`); przecinki i
nowe linie w polu należy ująć w cudzysłowy. Nagłówek ma następujące kolumny:

```text
nazwa,cena_wejscie_per_1M_USD,cena_wyjscie_per_1M_USD,okno_kontekstu,klasa,uwaga,id,family,max_output,always_thinks,tier_above,tier_input,tier_output,offpeak_input,offpeak_output,checked_at,source
```

| Kolumna | Znaczenie |
| --- | --- |
| `nazwa` | nazwa wyświetlana modelu |
| `cena_wejscie_per_1M_USD` | cena w USD za 1 mln tokenów wejściowych |
| `cena_wyjscie_per_1M_USD` | cena w USD za 1 mln tokenów wyjściowych |
| `okno_kontekstu` | maksymalne okno kontekstu w tokenach |
| `klasa` | umowna klasa porównania, np. `mini`, `standard`, `frontier` |
| `uwaga` | notatka, założenia i źródła dla człowieka |
| `id` | stabilny, unikalny identyfikator modelu |
| `family` | rodzina współczynnika tokenów, np. `openai`, `claude`, `claudeNew`, `deepseek`, `qwen` |
| `max_output` | limit tokenów wyjściowych modelu |
| `always_thinks` | czy model zawsze używa rozumowania (`true`/`false`) |
| `tier_above` | próg długiego kontekstu w tokenach; puste, jeśli nie dotyczy |
| `tier_input` | cena wejścia powyżej progu; puste, jeśli nie dotyczy |
| `tier_output` | cena wyjścia powyżej progu; puste, jeśli nie dotyczy |
| `offpeak_input` | cena wejścia poza szczytem; puste, jeśli nie dotyczy |
| `offpeak_output` | cena wyjścia poza szczytem; puste, jeśli nie dotyczy |
| `checked_at` | data sprawdzenia ceny, `YYYY-MM-DD` |
| `source` | URL źródła ceny lub dokumentacji |

Pierwszy wiersz musi być nagłówkiem. Wartości cen, limitów i progów muszą być
liczbami nieujemnymi, nie większymi niż 1 miliard; limity i progi muszą być
dodatnimi liczbami całkowitymi. `id`, `family` i `always_thinks` opisują metadane używane
przez kalkulator; nie należy zastępować ich nazwą wyświetlaną. Puste pola
opcjonalnych stawek oznaczają brak danej taryfy.

## Założenia, które trzeba sprawdzić przed decyzją

- Ceny modeli były sprawdzone **14.09.2026**. Są migawką, więc przed decyzją
  zakupową trzeba sprawdzić aktualne cenniki dostawców.
- Współczynniki tokenów są **ilustracyjne**. Przeliczają przykładowe obciążenie
  między rodzinami modeli i nie są wywołaniem ani obietnicą zgodności z
  rzeczywistym tokenizerem.
- Przepustowość GPU to wartości wejściowe do modelu obliczeniowego. Wydajność
  sprzętu nie została tu zweryfikowana jako pojemność produkcyjna; nie jest to
  test obciążeniowy, SLA ani gwarancja liczby jednoczesnych użytkowników.
- Domyślne `cloudPrice = 10 000 PLN/mies.` oznacza **sam GPU w chmurze**.
  `cloudOps = 0 PLN/mies.` jest osobnym placeholderem na stałą obsługę chmury,
  a nie potwierdzoną ceną operatora.
- `kwh = 1 PLN/kWh` to przyjęte założenie ceny energii **netto**.
- `ownReplace = 36 miesięcy` (wymiana sprzętu) jest niezależne od
  `ownAmort = 36 miesięcy` (amortyzacja zakupu). Obie wartości można zmienić
  osobno; to samo dotyczy `smallReplace` i `smallAmort` dla Dell GB10.
- `ownOps`, `smallOps` i `cloudOps` domyślnie wynoszą 0: utrzymanie sprzętu nie
  jest liczone, dopóki nie wpiszesz własnej kwoty.
- Odpowiedź o zwrocie zakupu podaje **pierwsze** przecięcie kosztów gotówkowych. Pierwszy próg
  przewagi nie jest stałym ani wiecznym progiem opłacalności: po zmianie
  obciążenia, taryfy lub liczby GPU porównanie może się odwrócić ponownie.

## Weryfikacja

Regresja obliczeń, scenariuszy i stron pomocniczych nie wymaga zależności
(te same polecenia uruchamia CI):

```bash
node tests/core.test.cjs
node tests/scenario.test.cjs
node tests/layout.test.cjs
python3 tests/browser-smoke.py
node tests/sub-core.test.cjs
node tests/sub-sync.test.cjs
python3 tests/sub-smoke.py
```

Co sprawdzają:

- `core.test.cjs` – obliczenia, CSV i regresje kosztów,
- `scenario.test.cjs` – zapis i odczyt scenariusza oraz odrzucanie błędnych
  danych,
- `layout.test.cjs` – układ panelu ustawień, nagłówka (w tym nawigacji do
  stron pomocniczych),
- `browser-smoke.py` – lokalny serwer na losowym porcie i świeży profil
  Google Chrome/Chromium; tryb `?verify=1` przez `http://` i `file://`
  (kontrakt DOM w każdym przebiegu, w tym testy pojemności
  i dane czterech kart: `data-small-monthly`, `data-small-units`,
  `data-small-eligible`, `data-break-even-small-users`,
  `data-payback-small-vs-cloud`, `data-api-software`, `data-own-software`;
  każda karta publikuje `data-software` i `data-infra`) oraz nagłówek przy 360 i 320 px (nic nie jest ucięte, nagłówek
  nie zachodzi na wyniki, strona nie przewija się w bok),
- `sub-core.test.cjs` – rdzeń stron pomocniczych: walidacja pól, wzory
  subskrypcji, API i agenta,
- `sub-sync.test.cjs` – zgodność cen modeli i współczynników tokenów z
  `index.html`,
- `sub-smoke.py` – przeglądarkowy test `seats.html` i `agent.html` przez `http://` (desktop i mobile) oraz `file://`: kontrakt DOM,
  przepływy użytkownika i stan po zmianie ustawień.

Jeśli przeglądarka nie jest zainstalowana, testy przeglądarkowe kończą się
czytelnym komunikatem z instrukcją instalacji. Skrypty niczego nie instalują.

## English quick note

`aicalc` is a dependency-free, single-file educational estimator for RAG
inference costs across model API (plus PLN 1,000 per month of fixed
infrastructure), cloud GPU, a small Dell Pro Max GB10 deployment priced at
PLN 35,000 (available up to 100 users, sized with an 80% utilization ceiling), and own-server options, plus a
RAG software layer (SaaS 5,000 PLN per month with API/cloud;
a 150,000 PLN licence with a 20,000 PLN yearly support contract on hardware).
It is an estimate, not a quote or a capacity guarantee. Open `index.html` directly or
serve the directory with Python. Prices were checked on 14 Sep 2026; token
factors are illustrative and hardware throughput is not production-verified.
On desktop, editable inputs live in a left settings sidebar; on small screens,
use the Settings button and close it with the close control, backdrop, or
`Escape`.

Two companion pages share the same header navigation, PL/EN toggle and
no-build setup: `seats.html` (seat subscriptions vs API vs local hardware;
seat prices verified 2026-11-05: ChatGPT Business 25 USD, Microsoft 365 Copilot
25.2 USD, Claude Team 25 USD per seat per month), and `agent.html` (agent cost per
run and per month: LLM, tools and platform, with a short step-by-step
explanation of what the agent does in one run). On the seats page the break-even against the API
is one of three kinds: `from` a number of chats, `always` or `never`. All figures are estimates in net
PLN; no page prices people's working time and none calculates a return on
investment; GB10 throughput is not checked on the seats
page. They will be online at <https://workszop.github.io/aicalc/seats.html>,
and `agent.html` after deployment. Run all seven checks listed under
"Weryfikacja"; CI runs the same commands.
