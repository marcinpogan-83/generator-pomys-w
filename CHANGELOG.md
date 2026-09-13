# Historia zmian

Format: kolejne wpisy odpowiadają commitom na gałęzi rozwojowej.

## Nieopublikowane

### Dodane
* **Drugi typ organizera: kieszeniowy (rzędy × linie)** — konstrukcja
  odtworzona z przykładowego projektu LightBurn: boki z opadającą szyną
  i wcięciami, identyczne przegrody poprzeczne z języczkami numerów i wybraniem
  na palec, przegrody podłużne na krzyżowy wpust (skośne wpusty), pochyłe dno,
  panel tylny z numerami ostatniego rzędu i panel czołowy z grawerem klasy
  (`src/model-rack.js`). Liczba miejsc = rzędy × linie, obie wartości
  parametryczne.
* Rejestr modeli (`src/models.js`) i formularz budowany z opisu pól — wybór typu
  organizera w interfejsie oraz `--model` w eksporcie z linii poleceń.
* **Eksport do LightBurn (.lbrn2)** (`src/lbrn.js`): warstwy CUT/ENGRAVE,
  ścieżki `VertList`/`PrimList`, teksty jako encje `Text`; przycisk w UI,
  plik obok SVG i DXF w eksporcie CLI.
* Walidacja plików LightBurn w `tools/validate_dxf.py` + testy `tests/python/test_lbrn.py`
  (razem z testami negatywnymi walidatora).
* Testy modelu schodkowego, rejestru modeli i eksportu LightBurn; testy wizualne
  obejmują przełączanie typu organizera i wzorzec rasteru dla obu modeli.
* Podział generatora na moduły ESM (`src/`) i build jednoplikowy (`tools/build.mjs`).
* Walidacja konfiguracji (`validateConfig`) pokazywana w interfejsie.
* Kontrola poprawności rozkroju (`validatePlacement`): kolizje, margines, odstęp.
* Eksport bezgłowy `tools/export-cli.mjs` (SVG + DXF + `manifest.json`).
* Walidator DXF oparty o `ezdxf` (`tools/validate_dxf.py`) i 21 testów `pytest`,
  w tym testy negatywne potwierdzające skuteczność walidatora.
* Testy jednostkowe geometrii, modelu, rozkroju i eksportu (54 testy, `node --test`).
* Testy wizualne w Chromium (Playwright) z porównaniem rasteru do wzorca.
* Benchmark rozkroju `tools/bench-nest.mjs` oraz zapis pierwotnego algorytmu
  w `tests/baseline/legacy-nest.js`.
* CI (GitHub Actions) uruchamiające wszystkie trzy zestawy testów.

### Zmienione
* **Zatrzaski przy czopach** w modelu kieszeniowym: podcięcie na grubość
  materiału za czopem, zaczep z rampą po stronie zewnętrznej i sfazowane czoło
  czopa — tak jak w przykładowym projekcie. Dotyczy przegród poprzecznych oraz
  paneli tylnego i czołowego; można je wyłączyć i przestawić ich wymiary.
* **Wybór czcionki numerów**: tryb „wektor kreskowy" (jak dotąd) albo „tekst
  w czcionce" z nazwą kroju i wysokością; nazwa kroju trafia do SVG
  (`font-family`), DXF (tablica `STYLE` z plikiem czcionki) i LightBurn
  (atrybut `Font`) i obejmuje też grawer nazwy szkoły i klasy.
* Poprawka UI: przełączenie pola typu checkbox nie zgłasza już błędu
  `setSelectionRange` przy przywracaniu ogniskowania.
* Bundler zatrzymuje build przy aliasie w imporcie (`import { x as y }`), bo
  łączy moduły w jedną przestrzeń nazw; test uruchamia zbudowany skrypt w `vm`.
* Plik dystrybucyjny nazywa się `dist/organizer-generator.html` (generator nie
  dotyczy już tylko modelu SECURE).
* Rozkrój: MaxRects z pełnym podziałem wolnych prostokątów, 30 kombinacji
  sortowania i heurystyk; nigdy nie gorszy od poprzedniego, w 13/296 losowych
  przypadkach mniej arkuszy, w 256/296 ciaśniej upakowany ostatni arkusz.
* DXF: komplet sekcji HEADER/TABLES/ENTITIES, wersja AC1009, milimetry,
  zdefiniowane warstwy CUT i ENGRAVE, poprawne flagi zamknięcia konturów.
* Znaczniki zawiasów zwężone do pasa 5 mm, numery przegródek i szczeliny
  przesunięte — znaczniki nie nachodzą już na numery.

### Naprawione
* **Pióra dna wychodzące poza obrys ściany w małych organizerach.** Przy 12/15/18
  przegródkach przednie gniazdo dna wchodziło w łuk nóżek i przekraczało krawędź
  boku (przy 9 wypływ ~0,9 mm, przy 12 prześwit ~0,2 mm). Liczba i szerokość
  piór dna oraz gniazd w bokach są teraz liczone z jednego źródła (`floorTabSpec`)
  i dopasowywane do długości dna: pióra zwężają się, trzymają nad linią łuku, a
  gdy dwa się nie mieszczą — zostaje jedno, wyśrodkowane. Prześwit do krawędzi
  ≥2 mm dla wszystkich rozmiarów od 12 przegródek w górę; skrajnie krótkie dno
  daje czytelny błąd zamiast wadliwej geometrii. Dodano warianty R-12 i R-18.
* Otwarte ścieżki (kreski cyfr, półzakładki) nie są domykane — laser nie tnie
  drugi raz po krawędzi płyty, a cyfry 1, 2, 4, 7 nie mają fałszywej kreski.
* Otwór kluczowy to jeden kontur (suma koła i rowka) zamiast dwóch nachodzących
  konturów z linią cięcia w środku otworu.
* Czopy przegrody pionowej i odpowiadające im gniazda liczone z jednego źródła
  (wcześniej 22 mm wpisane na sztywno w dwóch miejscach).
* Numer przegródki i szczelina wglądu mają rozdzielone pola i nie wychodzą poza
  komórkę przy wąskich przegródkach.
