# Historia zmian

Format: kolejne wpisy odpowiadają commitom na gałęzi rozwojowej.

## Nieopublikowane

### Dodane
* **Drugi typ organizera: schodkowy (kieszenie pochyłe)** — boki ze schodkowo
  opadającą krawędzią, identyczne przegrody poprzeczne w pionowych wcięciach,
  przegrody podłużne na krzyżowy zakład, podstawa, plecy i panel czołowy
  z grawerem klasy; numery kieszeni grawerowane wektorowo (`src/model-stepped.js`).
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
* Otwarte ścieżki (kreski cyfr, półzakładki) nie są domykane — laser nie tnie
  drugi raz po krawędzi płyty, a cyfry 1, 2, 4, 7 nie mają fałszywej kreski.
* Otwór kluczowy to jeden kontur (suma koła i rowka) zamiast dwóch nachodzących
  konturów z linią cięcia w środku otworu.
* Czopy przegrody pionowej i odpowiadające im gniazda liczone z jednego źródła
  (wcześniej 22 mm wpisane na sztywno w dwóch miejscach).
* Numer przegródki i szczelina wglądu mają rozdzielone pola i nie wychodzą poza
  komórkę przy wąskich przegródkach.
