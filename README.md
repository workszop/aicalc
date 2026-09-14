# aicalc – kalkulator kosztów AI

Jednoplikowy kalkulator edukacyjny porównujący miesięczny koszt asystenta RAG w
trzech wariantach:

1. płatne API modelu,
2. GPU w chmurze,
3. własny serwer.

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

## Scenariusze i cennik

- **Zapisz lokalnie** zapisuje ustawienia i aktualny cennik w pamięci
  przeglądarki. Zapisany scenariusz jest odczytywany przy kolejnym starcie.
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
lewej stronie. Panel obejmuje obciążenie, wybór modelu, parametry GPU i serwera,
ustawienia zaawansowane oraz operacje scenariusza. Po prawej stronie pozostają
wyniki, wykresy i porównanie modeli, więc zmiana parametrów nie wypycha
wyników poza ekran.

Karty wyników pokazują od razu kwoty miesięczne. Przycisk **Szczegóły kosztów**
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
  osobno.
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
`http://`, jak i `file://`. Jeśli przeglądarka nie jest zainstalowana, test
kończy się czytelnym komunikatem z instrukcją instalacji. Skrypt niczego nie
instaluje.

## English quick note

`aicalc` is a dependency-free, single-file educational estimator for RAG
inference costs across model API, cloud GPU, and own-server options. It is an
estimate, not a quote or a capacity guarantee. Open `index.html` directly or
serve the directory with Python. Prices were checked on 14 Sep 2026; token
factors are illustrative and hardware throughput is not production-verified.
On desktop, editable inputs live in a left settings sidebar; on small screens,
use the Settings button and close it with the close control, backdrop, or
`Escape`.
