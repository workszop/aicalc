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

## Uruchomienie

Projekt nie ma buildu ani zależności npm. Otwórz
[`/home/andrzey/git-claude/aicalc/index.html`](/home/andrzey/git-claude/aicalc/index.html) bezpośrednio w
przeglądarce (`file://`) albo uruchom opcjonalny serwer:

```bash
cd /home/andrzey/git-claude/aicalc
python3 -m http.server 8000
```

Następnie otwórz <http://127.0.0.1:8000/index.html>.

Wersja online: <https://workszop.github.io/aicalc/>.

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

Opcja jest przeznaczona dla małych wdrożeń: od **200 użytkowników**
(`smallMaxUsers` = 199) karta pokazuje „Opcja niedostępna” i GB10 nie bierze
udziału w porównaniu, paskach ani wykresie. Poniżej limitu, gdy szczyt
przekracza przepustowość, kalkulator dolicza kolejne sztuki GB10. Wartości
przepustowości trzeba zmierzyć na własnym modelu przed decyzją.

Parametry oprogramowania (sekcja „Oprogramowanie RAG”):
`softApi` 5 000, `softCloud` 5 000 PLN / mies., `softLicense` 150 000 PLN,
`softSupport` 20 000 PLN / rok, `softAmort` 36 mies. Przy API doliczana jest
stała infrastruktura `apiOps` (domyślnie 1 000 PLN / mies.: hosting aplikacji,
baza wektorowa, sieć); kwoty w tabeli modeli zawierają SaaS i tę
infrastrukturę. Koszty obsługi sprzętu (`cloudOps`, `ownOps`, `smallOps`) domyślnie
wynoszą 0.

## Scenariusze i cennik

- **Zapisz lokalnie** zapisuje ustawienia i aktualny cennik w pamięci
  przeglądarki (klucz `edulab-aicalc-scenario-v2`; scenariusze zapisane przez
  poprzednią wersję nie są odczytywane, bo nie mają pól GB10). Zapisany
  scenariusz jest odczytywany przy kolejnym starcie.
  Język PL/EN jest zapisywany niezależnie; ostatnia preferencja językowa ma
  pierwszeństwo przed językiem zapisanym w scenariuszu. Import również
  zachowuje wybraną preferencję.
- **Eksport JSON** i **Import JSON** pozwalają przenieść scenariusz między
  przeglądarkami. Import jest walidowany przed zastosowaniem.
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

Regresja obliczeń i scenariuszy nie wymaga zależności:

```bash
node tests/core.test.cjs
node tests/scenario.test.cjs
node tests/layout.test.cjs
python3 tests/browser-smoke.py
```

Ostatni test uruchamia lokalny serwer na losowym porcie i świeży profil
Google Chrome/Chromium, a następnie sprawdza tryb `?verify=1` zarówno przez
`http://`, jak i `file://` (25 sprawdzeń, w tym kontrakt DOM dla czterech
kart: `data-small-monthly`, `data-small-units`, `data-small-eligible`,
`data-break-even-small-users`, `data-payback-small-vs-cloud`,
`data-api-software`, `data-own-software`; każda karta publikuje
`data-software` i `data-infra`). Jeśli
przeglądarka nie jest zainstalowana, test
kończy się czytelnym komunikatem z instrukcją instalacji. Skrypt niczego nie
instaluje.

## English quick note

`aicalc` is a dependency-free, single-file educational estimator for RAG
inference costs across model API (plus PLN 1,000 per month of fixed
infrastructure), cloud GPU, a small Dell Pro Max GB10 deployment priced at
PLN 35,000 (available up to 199 users), and own-server options, plus a
RAG software layer (SaaS 5,000 PLN per month with API/cloud;
a 150,000 PLN licence with a 20,000 PLN yearly support contract on hardware).
It is an estimate, not a quote or a capacity guarantee. Open `index.html` directly or
serve the directory with Python. Prices were checked on 14 Sep 2026; token
factors are illustrative and hardware throughput is not production-verified.
On desktop, editable inputs live in a left settings sidebar; on small screens,
use the Settings button and close it with the close control, backdrop, or
`Escape`.
