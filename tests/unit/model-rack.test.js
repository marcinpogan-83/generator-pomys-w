import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRack, rackDims, validateRackConfig, RACK_SKU, RACK_DEFAULTS } from '../../src/model-rack.js';
import { shapeSegments } from '../../src/geometry.js';
import { segKey, selfIntersects, boundsOf } from '../helpers/geom.mjs';

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
  const d = rackDims({});
  const m = buildRack({});
  const cross = crossPanels(m)[0];
  const { overTop, railSlot, t } = d.cfg;
  assert.equal(cross.h, d.panelH);
  assert.ok(hasPoint(cross, 0, overTop), 'czop zaczyna sie na wysokosci szyny');
  assert.ok(hasPoint(cross, 0, overTop + railSlot), 'czop ma dlugosc osadzenia');
  assert.ok(hasPoint(cross, 2 * t, overTop), 'korpus cofniety o 2t (bok + wystep)');
  // dol przegrody lezy dokladnie na dnie: panelH = overTop + glebokosc kieszeni
  assert.ok(Math.abs(d.panelH - (overTop + d.cfg.pocketDepth)) < TOL);
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

test('validateRackConfig wylapuje niemozliwe ustawienia', () => {
  const err = cfg => validateRackConfig(cfg).filter(i => i.level === 'error').map(i => i.msg);
  assert.equal(err({}).length, 0);
  assert.ok(err({ t: 0 }).length);
  assert.ok(err({ fit: 5 }).length);
  assert.ok(err({ tilt: 0 }).length, 'zerowe pochylenie');
  assert.ok(err({ tilt: 60 }).length, 'zbyt duze pochylenie');
  assert.ok(err({ railSlot: 100 }).length, 'wciecie glebsze niz kieszen');
  assert.ok(err({ numTabW: 200 }).length, 'jezyczek szerszy niz kolumna');
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
