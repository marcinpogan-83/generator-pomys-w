# Historia zmian

Format: kolejne wpisy odpowiadają commitom na gałęzi rozwojowej.

## Nieopublikowane

### Dodane
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
