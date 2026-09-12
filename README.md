# Organizer na telefony — generator plików do cięcia

Parametryczny generator organizerów na telefony. Z konfiguracji buduje komplet
części, układa je na arkuszach i eksportuje do **SVG**, **DXF** i **LightBurn
(.lbrn2)** gotowych dla lasera.

Dostępne są dwa typy konstrukcji:

| Typ | Opis |
| --- | --- |
| **SECURE — szafka z drzwiami** | zamykana szafka, przegródki w siatce kolumn i rzędów, drzwi ze szczelinami wglądu i numerami |
| **Schodkowy — kieszenie pochyłe** | otwarty stojak: przegrody poprzeczne stoją w opadających wcięciach boków, między nimi powstają pochyłe kieszenie na telefony |

```
npm run build        # dist/organizer-generator.html — jeden plik, dwuklik, działa offline
npm test             # komplet testów: jednostkowe + DXF (ezdxf) + LightBurn + wizualne (Chromium)
```

## Co jest w repozytorium

| Ścieżka | Zawartość |
| --- | --- |
| `src/geometry.js` | prymitywy 2D: czopy, gniazda, otwór kluczowy, jednokreskowy font cyfr |
| `src/model.js` | model SECURE → lista części (`cut` / `engrave` / `texts`) + walidacja konfiguracji |
| `src/model-stepped.js` | model schodkowy: boki ze schodkową krawędzią, przegrody poprzeczne i podłużne |
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

### Schodkowy — kieszenie pochyłe

Odwzorowuje konstrukcję z przykładowego projektu LightBurn: dwa boki mają
schodkowo opadającą krawędź górną z pionowymi wcięciami, w których stoją
**identyczne przegrody poprzeczne**. Ponieważ opada krawędź, a nie przegrody,
wszystkie przegrody są tą samą częścią — różnią się tylko grawerem numerów.
Między przegrodami powstają pochyłe kieszenie na telefony, a przegrody podłużne
(połączone z poprzecznymi na krzyżowy zakład) dzielą szerokość na kolumny.
Całość spina podstawa, plecy i panel czołowy z nazwą szkoły i klasą.

Parametry: liczba kolumn i kieszeni, szerokość kolumny i kieszeni, wysokość
przegrody, głębokość osadzenia w boku, opad krawędzi na kieszeń (nachylenie),
zakład przegród, zapas przy krawędzi, wysokość korpusu.

```
node tools/export-cli.mjs --model stepped --sku K-24 --out out/K-24
node tools/export-cli.mjs --model stepped --set cols=4 --set pockets=10 --out out/wlasny
```

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
* model schodkowy jest własną, parametryczną konstrukcją powtarzającą zasadę
  działania przykładowego projektu (schodkowe wcięcia, identyczne przegrody,
  numerowane kieszenie), a nie kopią jego geometrii co do milimetra.
