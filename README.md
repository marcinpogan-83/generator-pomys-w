# Organizer na telefony — generator plików do cięcia

Parametryczny generator organizerów na telefony. Z konfiguracji buduje komplet
części, układa je na arkuszach i eksportuje do **SVG**, **DXF** i **LightBurn
(.lbrn2)** gotowych dla lasera.

Dostępne są dwa typy konstrukcji:

| Typ | Opis |
| --- | --- |
| **SECURE — szafka z drzwiami** | zamykana szafka, przegródki w siatce kolumn i rzędów, drzwi ze szczelinami wglądu i numerami |
| **Kieszeniowy — rzędy i linie** | konstrukcja z przykładowego projektu: przegrody poprzeczne stoją w opadających wcięciach boków, między nimi powstają kieszenie na telefony; liczba miejsc = rzędy × linie |

```
npm run build        # dist/organizer-generator.html — jeden plik, dwuklik, działa offline
npm test             # komplet testów: jednostkowe + DXF (ezdxf) + LightBurn + wizualne (Chromium)
```

## Co jest w repozytorium

| Ścieżka | Zawartość |
| --- | --- |
| `src/geometry.js` | prymitywy 2D: czopy, gniazda, otwór kluczowy, jednokreskowy font cyfr |
| `src/model.js` | model SECURE → lista części (`cut` / `engrave` / `texts`) + walidacja konfiguracji |
| `src/model-rack.js` | model kieszeniowy: boki z opadającą szyną, przegrody poprzeczne i podłużne, pochyłe dno |
| `src/models.js` | rejestr modeli: wartości domyślne, `build`/`validate` i opis pól formularza |
| `src/nest.js` | rozkrój MaxRects (5 heurystyk × 6 porządków sortowania) + kontrola kolizji |
| `src/layout.js`, `src/svg.js`, `src/dxf.js`, `src/lbrn.js` | przeniesienie części na arkusz i eksport (SVG, DXF, LightBurn) |
| `src/app.js` | interfejs (panel parametrów, podgląd, pobieranie plików) |
| `tools/` | build jednoplikowy, eksport CLI, walidator DXF, benchmark rozkroju, uruchamianie testów |
| `tests/` | testy jednostkowe (Node), wizualne (Playwright), walidacja DXF (pytest + ezdxf) |
| `legacy/` | pierwotna, jednoplikowa wersja generatora — punkt odniesienia |

Wersja deweloperska (`index.html`) ładuje moduły ESM, więc wymaga serwera HTTP
(`npx http-server`). Wersja do rozdania to zbudowany plik z `dist/`.

## Modele organizera

### SECURE — szafka z drzwiami

Korpus z przegródkami w siatce kolumn × rzędów, płyty poziome na pióra
wchodzące w gniazda boków, drzwi ze szczelinami wglądu, grawerowanymi numerami
i paskiem nagłówkowym (nazwa szkoły, klasa). Opcjonalnie pełne plecy i pełna
ramka drzwi.

### Kieszeniowy — rzędy i linie

Odwzorowuje konstrukcję z przykładowego projektu LightBurn (organizer klasowy
na 24 telefony):

* dwa **boki** mają szynę opadającą pod kątem (domyślnie 20°), a w niej wcięcia
  co rozstaw kieszeni; niżej znajdują się pochyłe gniazda dna, gniazda panelu
  tylnego i czołowego oraz łuk nóżek,
* w wcięcia wchodzą czopy **identycznych przegród poprzecznych** — opada szyna,
  a nie przegrody, więc wszystkie są tą samą częścią i różnią się wyłącznie
  grawerem numeru,
* górna krawędź każdej przegrody ma **języczek z numerem** dla każdej linii
  i wybranie między nimi, żeby dało się chwycić telefon,
* **przegrody podłużne** biegną wzdłuż spadku i dzielą kieszenie na linie
  (połączenie na krzyżowy wpust ze skośnymi wpustami po stronie przegrody),
* **zatrzaski przy czopach**: za czopem jest podcięcie na grubość materiału,
  w które wskakuje krawędź boku, a zewnętrzna warstwa czopa wysuwa się za nie
  z rampą ułatwiającą wciśnięcie — przegroda nie wypada z wcięcia. Czoła czopów
  są sfazowane. Zatrzaski można wyłączyć i zmienić ich wymiary,
* **pióra dna dobierane proporcjonalnie do rozmiaru**: liczba, szerokość
  i rozstaw piór dna (oraz odpowiadających im gniazd w bokach) są liczone
  z jednego źródła i skalowane z długością dna. Szerokość pióra to ~14 %
  długości (do limitu 28 mm), dwa pióra są rozsuwane symetrycznie na ~34 %
  długości — w większych organizerach daleko od siebie (sztywność na
  skręcanie), w mniejszych bliżej, ale zawsze z realnym odstępem. Gdy dno jest
  za krótkie, by rozsunąć dwa pióra sensownie, zostaje jedno, wyśrodkowane.
  Wszystkie pióra trzymają się nad linią łuku, w obrysie ściany,
* **pochyłe dno** równoległe do szyny, **panel tylny** z numerami ostatniego
  rzędu i **panel czołowy** z nazwą szkoły i klasą.

Liczba miejsc = **rzędy × linie**. Dodanie rzędu pogłębia korpus o rozstaw
kieszeni i dokłada jedną przegrodę poprzeczną (oraz wcięcie w szynie i wpust
w przegrodach podłużnych); dodanie linii poszerza wszystkie części o szerokość
linii i dokłada jedną przegrodę podłużną. Numeracja biegnie od przodu, numery
każdego rzędu są grawerowane na przegrodzie zamykającej go od tyłu.

Warianty katalogowe: R-12 (4×3), R-15 (5×3), R-18 (6×3), R-24 (8×3), R-30 (10×3), R-32 (8×4).

```
node tools/export-cli.mjs --model rack --sku R-24 --out out/R-24
node tools/export-cli.mjs --model rack --set rows=12 --set cols=4 --out out/wlasny
```

Pozostałe parametry: szerokość linii, prześwit kieszeni, głębokość kieszeni,
wystawanie przegrody ponad szynę, kąt pochylenia, osadzenie w boku, wysokość
panelu czołowego, łuk nóżek, wymiary języczka z numerem, podcięcie i zaczep
zatrzasku, sfazowanie czopa.

## Numery i czcionka

Numery przegródek można wystawić na dwa sposoby (pole „Numery"):

| Tryb | Co trafia do pliku |
| --- | --- |
| **Wektor kreskowy** | jednokreskowe krzywe — wchodzą do każdej maszyny bez instalowania czcionki |
| **Tekst w czcionce** | encja tekstu z nazwą kroju: `font-family` w SVG, tablica `STYLE` w DXF (np. `DEJAVU_SANS` → `DejaVu Sans.ttf`), atrybut `Font` w LightBurn |

Nazwa czcionki z pola „Czcionka" dotyczy też nazwy szkoły i klasy. Wysokość
numeru ustawia się osobno (`0` = dobierz automatycznie z wysokości języczka).
Krój musi być zainstalowany w programie sterującym laserem — jeśli maszyna go
nie ma, zostaw wektor kreskowy albo zamień tekst na krzywe w Inkscape.

## Format wyjściowy

* jednostki: **milimetry**, skala 1:1 (`$INSUNITS = 4`, SVG w `mm`),
* warstwa **CUT** — cięcie, warstwa **ENGRAVE** — grawer (numery, nazwa szkoły),
* DXF w wersji **R12 (AC1009)** z kompletem sekcji HEADER / TABLES / ENTITIES,
* LightBurn `.lbrn2`: dwie warstwy (`0` = CUT, `1` = ENGRAVE), ścieżki jako
  `VertList` + `PrimList`, teksty jako encje `Text`,
* kontury zamknięte mają flagę `70 = 1`, kreski grawerunku pozostają otwarte,
  więc laser nie przejeżdża dwa razy po tej samej linii,
* numery przegródek to wektor kreskowy (bez czcionek); nazwa szkoły idzie jako
  encja TEXT — jeśli maszyna jej nie zaimportuje, wystarczy zamienić na krzywe.

## Testy

```
npm test                 # wszystko naraz (brakujące środowisko = pominięcie, nie błąd)
npm run test:unit        # 83 testy: geometria, oba modele, rozkrój, eksport, build
npm run test:dxf         # 44 testy: ezdxf i LightBurn na siedmiu konfiguracjach eksportu
npm run test:visual      # 9 testów: render w Chromium + porównanie rasteru z wzorcem
```

### Walidacja DXF (ezdxf)

`tools/validate_dxf.py` otwiera wyeksportowane arkusze biblioteką `ezdxf`
i sprawdza, czy plik jest **naprawdę rozpoznawalny**, a nie tylko podobny do DXF:

* `ezdxf.readfile` + `Auditor` bez błędów i bez cichych napraw,
* wersja AC1009, `$INSUNITS = 4`, zdefiniowane warstwy `CUT` i `ENGRAVE`,
* tylko dozwolone typy encji i tylko na właściwych warstwach,
* brak odcinków zerowej długości, zamkniętych konturów o zerowym polu
  i **powtórzonych odcinków cięcia** (podwójny przejazd lasera),
* geometria mieści się w polu roboczym arkusza i w obrysie zadeklarowanej części,
* liczba konturów, flagi zamknięcia i teksty zgadzają się z `manifest.json`,
* SVG i DXF opisują tę samą geometrię (po odbiciu osi Y),
* plik LightBurn ma poprawną strukturę XML, obie warstwy, spójne `VertList` /
  `PrimList` (domknięcie konturu, indeksy w zakresie) i te same liczby konturów
  i tekstów co DXF.

Testy negatywne (uszkodzony plik, encja na warstwie `0`, zdublowany kontur,
geometria poza arkuszem, brak jednostek) potwierdzają, że walidator faktycznie
łapie błędy, zamiast zawsze mówić „OK”.

```
node tools/export-cli.mjs --out out/S-30 --sku S-30 --sheet 760x760
python3 tools/validate_dxf.py out/S-30
```

### Weryfikacja wizualna

Testy wizualne otwierają zbudowaną stronę w Chromium (Playwright) i sprawdzają
liczbę ścieżek w DOM względem modelu, brak geometrii poza arkuszem, działanie
przełączników (w tym przełączenie typu organizera i wymianę pól formularza)
oraz — po rasteryzacji podglądu obu modeli — zgodność obrazu z wzorcem
`tests/baseline/render-signature.json` (siatka 24×24 pokrycia tuszem).
Zrzuty ekranu trafiają do `artifacts/visual/` i nadają się do obejrzenia okiem.

```
node tools/run-visual.mjs                    # porównanie z wzorcem
node tools/run-visual.mjs --update-baseline  # świadoma aktualizacja wzorca po zmianie rysunku
```

## Rozkrój

Algorytm: MaxRects z pełnym podziałem wolnych prostokątów i przycinaniem
zawartych, uruchamiany dla **30 kombinacji** (6 porządków sortowania × 5
heurystyk wyboru miejsca: BSSF, BLSF, BAF, bottom-left, contact point).
Wybierany jest wynik o najmniejszej liczbie arkuszy, a przy remisie ten, który
zostawia większy spójny zrzut na ostatnim arkuszu.

Porównanie z pierwotnym algorytmem (`node tools/bench-nest.mjs 300`, 296
losowych konfiguracji):

| miara | wynik |
| --- | --- |
| arkusze łącznie | 638 → 625 (−2,0%) |
| przypadki z mniejszą liczbą arkuszy | 13 |
| przypadki z większą liczbą arkuszy | 0 |
| ciaśniej upakowany ostatni arkusz | 256 (luźniej: 2) |
| średni czas rozkroju | ~1 ms |

Poprawność rozkroju (brak nachodzenia, margines, odstęp, kompletność nakładu)
jest sprawdzana testem, a nie tylko oglądana — `validatePlacement()`.

## Ograniczenia

* rozkrój operuje na prostokątach opisujących części, nie na ich rzeczywistym
  obrysie — części o wklęsłym kształcie nie są wpasowywane w siebie,
* nazwa szkoły jest encją TEXT (zależną od czcionki maszyny), numery przegródek
  są wektorem i nie mają tego problemu,
* generator nie liczy kompensacji szerokości wiązki (kerf) — służy do tego pole
  „kompensacja szczeliny” dobierane doświadczalnie dla danej maszyny i materiału,
* model kieszeniowy odtwarza konstrukcję i wymiary przykładowego projektu
  (bok 200×158, przegroda 318×113, panel czołowy 318×87, przegroda podłużna
  230×80, dno 312×201 przy 8 rzędach × 3 liniach i materiale 3 mm), ale jest
  własną, parametryczną implementacją — detale zdobnicze i drobne zatrzaski
  oryginału nie są odwzorowane co do milimetra.
