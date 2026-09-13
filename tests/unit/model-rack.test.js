import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRack, rackDims, validateRackConfig, floorTabSpec, RACK_SKU, RACK_DEFAULTS } from '../../src/model-rack.js';
import { shapeSegments } from '../../src/geometry.js';
import { segKey, selfIntersects, boundsOf, pointInPolygon, distToPolygon } from '../helpers/geom.mjs';

const TOL = 1e-6;
const partOf = (m, name) => m.parts.find(p => p.name === name);
const crossPanels = (m) => m.parts.filter(p => /^Przegroda \d+ /.test(p.name));
const hasPoint = (part, x, y, tol = 0.02) =>
  part.cut.some(s => s.pts.some(p => Math.abs(p[0] - x) < tol && Math.abs(p[1] - y) < tol));

test('domyslny wariant odtwarza wymiary przykladu (8 rzedow x 3 linie)', () => {
  const m = buildRack({});
  const d = rackDims({});
  assert.equal(m.cells, 24);
  assert.deepEqual(m.issues, []);
  // przyklad: bok 200x157.6, przegroda 318x113, panel czolowy 318x86.7,
  // przegroda podluzna 229x80.3, dno 314x199
  const bok = partOf(m, 'Bok');
  assert.ok(Math.abs(bok.w - 200) < 3, `bok ${bok.w}`);
  assert.ok(Math.abs(bok.h - 158) < 3, `bok ${bok.h}`);
  const cross = crossPanels(m)[0];
  assert.ok(Math.abs(cross.w - 318) < 1, `przegroda ${cross.w}`);
  assert.ok(Math.abs(cross.h - 113) < 1, `przegroda ${cross.h}`);
  const front = partOf(m, 'Panel czolowy');
  assert.ok(Math.abs(front.h - 87) < 2, `panel czolowy ${front.h}`);
  const div = partOf(m, 'Przegroda podluzna');
  assert.ok(Math.abs(div.w - 230) < 4, `przegroda podluzna ${div.w}`);
  assert.ok(Math.abs(div.h - 80) < 2, `przegroda podluzna ${div.h}`);
  const floor = partOf(m, 'Dno (pochyle)');
  assert.ok(Math.abs(floor.w - 312) < 3, `dno ${floor.w}`);
  assert.ok(Math.abs(floor.h - 201) < 4, `dno ${floor.h}`);
});

test('liczba czesci wynika z rzedow i linii', () => {
  for (const [rows, cols] of [[8, 3], [10, 3], [8, 4], [5, 2], [3, 1]]) {
    const m = buildRack({ sku: 'wlasny', rows, cols });
    assert.equal(m.cells, rows * cols, `${rows}x${cols}`);
    // przegrody standardowe: rows - 1 (pierwszy rzad zamyka panel tylny)
    assert.equal(crossPanels(m).length, rows - 1);
    assert.equal(partOf(m, 'Bok').qty, 2);
    assert.ok(partOf(m, 'Panel czolowy'));
    assert.ok(partOf(m, `Panel tylny (kieszenie ${(rows - 1) * cols + 1}-${rows * cols})`));
    const div = partOf(m, 'Przegroda podluzna');
    if (cols > 1) assert.equal(div.qty, cols - 1);
    else assert.equal(div, undefined, 'jedna linia nie potrzebuje przegrod podluznych');
  }
});

test('dodanie rzedu wydluza bok i dokłada wciecie w szynie', () => {
  const a = buildRack({ sku: 'wlasny', rows: 6, cols: 3 });
  const b = buildRack({ sku: 'wlasny', rows: 7, cols: 3 });
  const da = rackDims({ sku: 'wlasny', rows: 6, cols: 3 });
  const db = rackDims({ sku: 'wlasny', rows: 7, cols: 3 });
  assert.ok(Math.abs((db.D - da.D) - db.pitch) < TOL, 'glebokosc rosnie o rozstaw kieszeni');
  assert.equal(crossPanels(b).length - crossPanels(a).length, 1);
  assert.equal(b.cells - a.cells, 3);
  // kazda przegroda podluzna dostaje dodatkowy wpust
  const lapsA = a.parts.find(p => p.name === 'Przegroda podluzna').cut[0].pts.length;
  const lapsB = b.parts.find(p => p.name === 'Przegroda podluzna').cut[0].pts.length;
  assert.equal(lapsB - lapsA, 4, 'wpust to cztery dodatkowe punkty obrysu');
});

test('dodanie linii poszerza czesci i dokłada przegrode podluzna', () => {
  const a = buildRack({ sku: 'wlasny', rows: 8, cols: 3 });
  const b = buildRack({ sku: 'wlasny', rows: 8, cols: 4 });
  const da = rackDims({ sku: 'wlasny', rows: 8, cols: 3 });
  const db = rackDims({ sku: 'wlasny', rows: 8, cols: 4 });
  assert.ok(Math.abs((db.W - da.W) - (da.cfg.cellW + da.cfg.t)) < TOL, 'szerokosc rosnie o linie');
  assert.equal(partOf(b, 'Przegroda podluzna').qty, 3);
  assert.equal(b.cells - a.cells, 8);
  assert.equal(crossPanels(a).length, crossPanels(b).length, 'liczba przegrod poprzecznych bez zmian');
});

test('kazdy ksztalt miesci sie w obrysie swojej czesci', () => {
  for (const cfg of [{}, { sku: 'R-30' }, { sku: 'R-32' }, { sku: 'R-15' },
                     { sku: 'wlasny', rows: 3, cols: 1 },
                     { sku: 'wlasny', rows: 14, cols: 5, cellW: 90, pocketW: 18 }]) {
    const m = buildRack(cfg);
    assert.deepEqual(m.issues.filter(i => i.level === 'error'), [], JSON.stringify(cfg));
    for (const part of m.parts) {
      const b = boundsOf([...part.cut, ...part.engrave]);
      assert.ok(b.minX >= -TOL && b.minY >= -TOL, `${part.name}: ujemne wspolrzedne`);
      assert.ok(b.maxX <= part.w + TOL, `${part.name}: poza szerokoscia`);
      assert.ok(b.maxY <= part.h + TOL, `${part.name}: poza wysokoscia`);
    }
  }
});

test('kontury ciecia bez samoprzeciec i podwojnych odcinkow', () => {
  for (const cfg of [{}, { sku: 'R-32' }]) {
    const m = buildRack(cfg);
    for (const part of m.parts) {
      const seen = new Set();
      for (const s of part.cut) {
        assert.equal(selfIntersects(s), false, `${part.name}: samoprzeciecie`);
        for (const [a, b] of shapeSegments(s)) {
          const k = segKey(a, b);
          assert.ok(!seen.has(k), `${part.name}: powtorzony odcinek`);
          seen.add(k);
        }
      }
    }
  }
});

test('wciecia w szynie odpowiadaja przegrodom poprzecznym', () => {
  const d = rackDims({});
  const m = buildRack({});
  const bok = partOf(m, 'Bok');
  const slotT = d.cfg.t - d.cfg.fit;
  for (let k = 1; k < d.cfg.rows; k++) {
    const x = d.panelX[k];
    assert.ok(hasPoint(bok, x, d.railY(x)), `brak wciecia przy x=${x}`);
    const bottom = d.railY(x + slotT / 2) + d.cfg.railSlot;
    assert.ok(hasPoint(bok, x, bottom), `wciecie ma zla glebokosc przy x=${x}`);
  }
});

test('czop przegrody siedzi w wcieciu, a dol przegrody na dnie', () => {
  const cfg = { latch: false, tabChamfer: 0 };
  const d = rackDims(cfg);
  const m = buildRack(cfg);
  const cross = crossPanels(m)[0];
  const { overTop, railSlot, t } = d.cfg;
  assert.equal(cross.h, d.panelH);
  assert.ok(hasPoint(cross, 0, overTop), 'czop zaczyna sie na wysokosci szyny');
  assert.ok(hasPoint(cross, 0, overTop + railSlot), 'czop ma dlugosc osadzenia');
  assert.ok(hasPoint(cross, 2 * t, overTop), 'korpus cofniety o 2t (bok + wystep)');
  // dol przegrody lezy dokladnie na dnie: panelH = overTop + glebokosc kieszeni
  assert.ok(Math.abs(d.panelH - (overTop + d.cfg.pocketDepth)) < TOL);
});

test('zatrzask podcina czop na grubosc boku i wysuwa zaczep', () => {
  const d = rackDims({});
  const m = buildRack({});
  const { t, overTop, railSlot, latchGrip, latchTip } = d.cfg;
  const cross = crossPanels(m)[0];
  const end = overTop + railSlot;
  // lewa krawedz: x = 0 (lico zewnetrzne), t (dno podciecia), 2t (korpus)
  assert.ok(hasPoint(cross, t, end + latchTip), 'zaczep wysuniety poza czop');
  assert.ok(hasPoint(cross, t, end - latchGrip), 'podciecie wchodzi w dlugosc czopa');
  assert.ok(hasPoint(cross, 2 * t, end - latchGrip), 'podciecie siega korpusu');
  // prawa krawedz - lustrzanie
  assert.ok(hasPoint(cross, d.W - t, end + latchTip));
  assert.ok(hasPoint(cross, d.W - t, end - latchGrip));
  // podciecie ma dokladnie grubosc materialu (miejsce na bok)
  const xs = cross.cut[0].pts.filter(q => Math.abs(q[1] - (end - latchGrip)) < 0.01).map(q => q[0]);
  assert.ok(xs.includes(t) || xs.some(x => Math.abs(x - t) < 0.01));
});

test('panele koncowe maja zatrzask od strony wsuwania', () => {
  const d = rackDims({});
  const m = buildRack({});
  const { t, overTop, latchGrip, latchTip } = d.cfg;
  for (const p of [m.parts.find(x => x.name.startsWith('Panel tylny')), partOf(m, 'Panel czolowy')]) {
    const y0 = overTop + 12;
    assert.ok(hasPoint(p, t, y0 - latchTip), `${p.name}: brak zaczepu`);
    assert.ok(hasPoint(p, t, y0 + latchGrip), `${p.name}: brak podciecia`);
  }
});

test('wylaczenie zatrzaskow upraszcza obrys, a fazy zostaja', () => {
  const zLatch = buildRack({});
  const bezLatch = buildRack({ latch: false });
  const a = crossPanels(zLatch)[0].cut[0].pts.length;
  const b = crossPanels(bezLatch)[0].cut[0].pts.length;
  assert.ok(b < a, 'bez zatrzaskow obrys ma mniej punktow');
  const d = rackDims({ latch: false });
  const cross = crossPanels(bezLatch)[0];
  const { t, overTop, railSlot, tabChamfer } = d.cfg;
  assert.ok(hasPoint(cross, 0, overTop + tabChamfer), 'faza wejscia zostaje');
  assert.ok(hasPoint(cross, 0, overTop + railSlot - tabChamfer), 'faza na drugim koncu');
  assert.ok(!hasPoint(cross, t, overTop + railSlot + d.cfg.latchTip), 'brak zaczepu');
});

test('numery mozna wystawic jako tekst w wybranej czcionce', () => {
  const stroke = buildRack({});
  const font = buildRack({ numStyle: 'czcionka', fontFamily: 'DejaVu Sans', numSize: 14 });
  const a = crossPanels(stroke)[0], b = crossPanels(font)[0];
  assert.ok(a.engrave.length >= 3 && a.texts.length === 0, 'domyslnie wektor kreskowy');
  assert.equal(b.engrave.length, 0);
  assert.equal(b.texts.length, 3);
  for (const t of b.texts) {
    assert.equal(t.font, 'DejaVu Sans');
    assert.equal(t.size, 14);
    assert.match(t.text, /^\d+$/);
  }
  // tekst klasy tez dostaje wybrana czcionke
  const front = partOf(font, 'Panel czolowy');
  for (const t of front.texts) assert.equal(t.font, 'DejaVu Sans');
  // wysokosc numeru 0 = dobrana automatycznie
  const auto = buildRack({ numStyle: 'czcionka', numSize: 0 });
  assert.ok(crossPanels(auto)[0].texts[0].size > 0);
});

test('wpusty krzyzowe przegrod poprzecznej i podluznej zachodza na siebie', () => {
  const d = rackDims({});
  const m = buildRack({});
  const cross = crossPanels(m)[0];
  for (const cx of d.divX) {
    assert.ok(hasPoint(cross, cx - (d.cfg.t - d.cfg.fit) / 2, d.panelH - d.lapPanel),
      `brak wpustu przy x=${cx}`);
  }
  // zaklad: suma wpustow jest wieksza niz pionowy zaklad przegrod (luz montazowy)
  assert.ok(d.lapPanel + d.lapDiv > d.overlap, 'wpusty musza sie spotkac');
  assert.ok(d.lapPanel < d.panelH && d.lapDiv < d.divH);
});

test('numeracja biegnie od przodu, panel tylny zamyka ostatni rzad', () => {
  const rows = 8, cols = 3;
  const m = buildRack({ sku: 'wlasny', rows, cols });
  const zakresy = m.parts
    .filter(p => /kieszenie \d+-\d+/.test(p.name))
    .map(p => p.name.match(/kieszenie (\d+)-(\d+)/).slice(1).map(Number));
  const wszystkie = zakresy.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)).sort((x, y) => x - y);
  assert.deepEqual(wszystkie, Array.from({ length: rows * cols }, (_, i) => i + 1));
  const tylny = m.parts.find(p => p.name.startsWith('Panel tylny'));
  assert.match(tylny.name, new RegExp(`kieszenie ${(rows - 1) * cols + 1}-${rows * cols}`));
  // najnizsze numery na przegrodzie najblizej przodu
  const ostatnia = crossPanels(m)[crossPanels(m).length - 1];
  assert.match(ostatnia.name, /kieszenie 1-3/);
  for (const p of crossPanels(m)) assert.ok(p.engrave.length >= cols, `${p.name}: brak numerow`);
});

test('panel czolowy niesie grawer klasy, a nie numery', () => {
  const m = buildRack({ schoolName: 'SP 7', className: 'Klasa 6b' });
  const front = partOf(m, 'Panel czolowy');
  assert.deepEqual(front.texts.map(t => t.text), ['SP 7', 'Klasa 6b']);
  assert.equal(front.engrave.length, 0);
});

test('bok ma gniazda paneli koncowych i pochylone gniazda dna', () => {
  const m = buildRack({});
  const d = rackDims({});
  const bok = partOf(m, 'Bok');
  // 1 obrys + 2 gniazda panelu tylnego + 1 czolowego + 2 dna
  assert.equal(bok.cut.length, 6);
  const floorSlots = bok.cut.slice(4);
  for (const s of floorSlots) {
    const ys = s.pts.map(p => p[1]), xs = s.pts.map(p => p[0]);
    const mid = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    assert.ok(Math.abs(mid[1] - (d.floorY(mid[0]) + d.cfg.t / 2)) < 1.5,
      'gniazdo dna musi lezec na linii dna');
  }
});

test('gniazda dna mieszcza sie w obrysie boku dla malych i duzych rozmiarow', () => {
  // Regresja: w organizerach na 18/15/12 przegrodek przednie gniazdo dna
  // wchodzilo w luk nozek i wychodzilo poza obrys boku.
  for (let rows = 3; rows <= 10; rows++) {
    const m = buildRack({ sku: 'wlasny', rows, cols: 3 });
    assert.deepEqual(m.issues.filter(i => i.level === 'error'), [], `rows=${rows}`);
    const bok = partOf(m, 'Bok');
    const outline = bok.cut[0].pts;
    const slots = bok.cut.slice(4);          // po obrysie i 3 gniazdach paneli
    assert.ok(slots.length >= 1, `rows=${rows}: brak gniazd dna`);
    for (const s of slots) {
      for (const p of s.pts) {
        assert.ok(pointInPolygon(p, outline), `rows=${rows}: gniazdo dna poza obrysem boku (${p})`);
        assert.ok(distToPolygon(p, outline) > 0.5, `rows=${rows}: gniazdo dna za blisko krawedzi`);
      }
    }
  }
});

test('pióra dna sa adaptacyjne: zwezaja sie, a potem schodza do jednego', () => {
  // dlugie dno -> dwa pełne pióra; krotkie -> wezsze; bardzo krotkie -> jedno
  const long = floorTabSpec(200, RACK_DEFAULTS);
  const mid = floorTabSpec(99, RACK_DEFAULTS);
  const short = floorTabSpec(60, RACK_DEFAULTS);
  assert.equal(long.n, 2);
  assert.equal(long.w, RACK_DEFAULTS.floorTabLen, 'dlugie dno: pełna szerokosc pióra');
  assert.equal(mid.n, 2);
  assert.ok(mid.w < RACK_DEFAULTS.floorTabLen && mid.fits, 'srednie dno: zwezone pióra');
  assert.equal(short.n, 1, 'krotkie dno: jedno pióro');
  assert.ok(short.fits);
});

test('rozstaw dwoch pior jest proporcjonalny i daje realny odstep', () => {
  // Regresja: wczesniej w malych rozmiarach dwa pióra staly 2 mm od siebie
  // (cienki, slaby mostek). Teraz rozstaw skaluje sie z dlugoscia dna, a odstep
  // miedzy piorami jest zawsze sensowny.
  let ratios = [];
  for (let rows = 4; rows <= 10; rows++) {
    const d = rackDims({ sku: 'wlasny', rows, cols: 3 });
    if (d.floorSpec.n !== 2) continue;
    const [a, b] = d.floorSpec.spans;
    const c2c = (b.start + b.w / 2) - (a.start + a.w / 2);
    const gap = b.start - (a.start + a.w);
    ratios.push(c2c / d.floorLen);
    assert.ok(gap >= 2 * d.cfg.t, `rows=${rows}: odstep miedzy piorami ${gap.toFixed(1)} za maly`);
    assert.ok(a.w <= d.cfg.floorTabLen + 1e-9, `rows=${rows}: pióro szersze niz limit`);
  }
  // rozstaw wzgledny stały (proporcjonalny do wielkosci)
  const spread = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  for (const r of ratios) assert.ok(Math.abs(r - spread) < 0.02, `rozstaw niestały: ${r.toFixed(3)} vs ${spread.toFixed(3)}`);
  assert.ok(spread > 0.28 && spread < 0.42, `rozstaw poza rozsadnym zakresem: ${spread.toFixed(2)}`);
});

test('szerokosc pióra rosnie z dlugoscia dna, do limitu', () => {
  const widths = [4, 5, 6, 8].map(rows => rackDims({ sku: 'wlasny', rows, cols: 3 }).floorSpec.w);
  for (let i = 1; i < widths.length; i++) {
    assert.ok(widths[i] >= widths[i - 1] - 1e-9, 'szersze dno -> szersze (lub rowne) pióro');
  }
  assert.ok(widths[widths.length - 1] <= RACK_DEFAULTS.floorTabLen + 1e-9, 'pióro nie przekracza limitu');
});

test('pióra dna w boku i w dnie to te same spans', () => {
  for (const rows of [3, 4, 8]) {
    const cfg = { sku: 'wlasny', rows, cols: 3 };
    const d = rackDims(cfg);
    const m = buildRack(cfg);
    const bok = partOf(m, 'Bok');
    const dno = partOf(m, 'Dno (pochyle)');
    const floorSlots = bok.cut.slice(4);
    assert.equal(floorSlots.length, d.floorSpec.n, `rows=${rows}: liczba gniazd = liczba pior`);
    // liczba jezyczkow (pior) w dnie: kazde pióro to 4 dodatkowe punkty na kazdej krawedzi
    const dnoPts = dno.cut[0].pts.length;
    assert.equal(dnoPts, 4 + 8 * d.floorSpec.n, `rows=${rows}: obrys dna`);
  }
});

test('bardzo krotkie dno jest zglaszane jako blad, nie tnie sie po cichu', () => {
  const m = buildRack({ sku: 'wlasny', rows: 2, cols: 3 });
  assert.ok(m.issues.some(i => i.level === 'error' && /dno/i.test(i.msg)),
    'za krotkie dno musi dac czytelny blad');
});

test('validateRackConfig wylapuje niemozliwe ustawienia', () => {
  const err = cfg => validateRackConfig(cfg).filter(i => i.level === 'error').map(i => i.msg);
  assert.equal(err({}).length, 0);
  assert.ok(err({ t: 0 }).length);
  assert.ok(err({ fit: 5 }).length);
  assert.ok(err({ tilt: 0 }).length, 'zerowe pochylenie');
  assert.ok(err({ tilt: 60 }).length, 'zbyt duze pochylenie');
  assert.ok(err({ railSlot: 100 }).length, 'wciecie glebsze niz kieszen');
  assert.ok(err({ numTabW: 200 }).length, 'jezyczek szerszy niz kolumna');
  assert.ok(err({ latchGrip: 30, latchTip: 10 }).length, 'zatrzask dluzszy niz czop');
  assert.ok(err({ numStyle: 'inny' }).length, 'nieznany styl numeru');
  assert.ok(err({ numStyle: 'czcionka', fontFamily: '  ' }).length, 'pusta nazwa czcionki');
  assert.ok(validateRackConfig({ pocketW: 8 }).some(i => i.level === 'warn'));
});

test('warianty katalogowe i determinizm', () => {
  for (const [sku, spec] of Object.entries(RACK_SKU)) {
    if (!spec) continue;
    assert.equal(buildRack({ sku }).cells, spec.rows * spec.cols, sku);
  }
  assert.equal(JSON.stringify(buildRack({})), JSON.stringify(buildRack({})));
  assert.ok(RACK_DEFAULTS.rows > 0 && RACK_DEFAULTS.cols > 0);
});
