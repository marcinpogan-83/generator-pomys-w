import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStepped, steppedDims, validateSteppedConfig, STEPPED_SKU, STEPPED_DEFAULTS } from '../../src/model-stepped.js';
import { shapeSegments } from '../../src/geometry.js';
import { segKey, selfIntersects, boundsOf } from '../helpers/geom.mjs';

const TOL = 1e-6;
const allShapes = (part) => [...part.cut, ...part.engrave];
const hasPoint = (part, x, y, tol = 0.01) =>
  part.cut.some(s => s.pts.some(p => Math.abs(p[0] - x) < tol && Math.abs(p[1] - y) < tol));
const partOf = (m, name) => m.parts.find(p => p.name === name);

test('domyslny wariant K-24 daje 24 kieszenie i komplet czesci', () => {
  const m = buildStepped({});
  assert.equal(m.cells, 24);
  assert.equal(m.issues.length, 0);
  assert.equal(partOf(m, 'Bok').qty, 2);
  assert.equal(partOf(m, 'Podstawa').qty, 1);
  assert.equal(partOf(m, 'Plecy').qty, 1);
  assert.equal(partOf(m, 'Panel czolowy').qty, 1);
  assert.equal(partOf(m, 'Przegroda podluzna').qty, 2);
  // przegrody poprzeczne: po jednej na kieszen + tylna
  const cross = m.parts.filter(p => p.name.startsWith('Przegroda poprzeczna'));
  assert.equal(cross.length, 9);
  assert.equal(cross.reduce((a, p) => a + p.qty, 0), 9);
});

test('wymiary gabarytowe wynikaja z siatki kieszeni', () => {
  const cfg = { sku: 'wlasny', cols: 3, cellW: 100, pockets: 8, pocketW: 24, t: 3, edgeMargin: 14 };
  const d = steppedDims(cfg);
  assert.equal(d.IW, 3 * 100 + 2 * 3);
  assert.equal(d.W, d.IW + 6);
  assert.equal(d.D, 2 * 14 + 8 * 27 + 3);
  assert.equal(d.crossX.length, 9);
  assert.equal(d.crossX[0], 14);
  assert.ok(Math.abs(d.crossX[8] + 3 - (d.D - 14)) < TOL, 'ostatnia przegroda zostawia zapas przy krawedzi');
});

test('kazdy ksztalt miesci sie w obrysie swojej czesci', () => {
  for (const cfg of [{}, { sku: 'K-30' }, { sku: 'K-32' },
                     { sku: 'wlasny', cols: 1, pockets: 4 },
                     { sku: 'wlasny', cols: 5, pockets: 12, cellW: 80, pocketW: 20 }]) {
    const m = buildStepped(cfg);
    assert.deepEqual(m.issues.filter(i => i.level === 'error'), [], JSON.stringify(cfg));
    for (const part of m.parts) {
      const b = boundsOf(allShapes(part));
      assert.ok(b.minX >= -TOL && b.minY >= -TOL, `${part.name}: ujemne wspolrzedne`);
      assert.ok(b.maxX <= part.w + TOL, `${part.name}: poza szerokoscia (${b.maxX} > ${part.w})`);
      assert.ok(b.maxY <= part.h + TOL, `${part.name}: poza wysokoscia (${b.maxY} > ${part.h})`);
    }
  }
});

test('zaden kontur ciecia nie przecina sam siebie i nie powtarza odcinka', () => {
  const m = buildStepped({});
  for (const part of m.parts) {
    const seen = new Set();
    for (const s of part.cut) {
      assert.equal(selfIntersects(s), false, `${part.name}: kontur ciecia przecina sam siebie`);
      for (const [a, b] of shapeSegments(s)) {
        const k = segKey(a, b);
        assert.ok(!seen.has(k), `${part.name}: powtorzony odcinek ciecia`);
        seen.add(k);
      }
    }
  }
});

test('wciecia w boku odpowiadaja przegrodom poprzecznym', () => {
  const cfg = {};
  const m = buildStepped(cfg);
  const d = steppedDims(cfg);
  const bok = partOf(m, 'Bok');
  const slotT = d.cfg.t - d.cfg.fit;
  for (const x of d.crossX) {
    const bottom = d.yTop(x + slotT / 2) + d.cfg.slotDepth;
    assert.ok(hasPoint(bok, x, d.yTop(x)), `brak lewej sciany wciecia przy x=${x}`);
    assert.ok(hasPoint(bok, x, bottom), `brak dna wciecia przy x=${x}`);
    assert.ok(hasPoint(bok, x + slotT, bottom), `wciecie ma zla szerokosc przy x=${x}`);
  }
});

test('czop przegrody poprzecznej ma dlugosc osadzenia w boku', () => {
  const cfg = {};
  const m = buildStepped(cfg);
  const d = steppedDims(cfg);
  const cross = partOf(m, 'Przegroda poprzeczna (tylna)');
  assert.equal(cross.w, d.W);
  assert.equal(cross.h, d.panelH);
  const tabY = d.panelH - d.cfg.slotDepth;
  assert.ok(hasPoint(cross, 0, tabY), 'brak zalamania czopu po lewej');
  assert.ok(hasPoint(cross, d.W, tabY), 'brak zalamania czopu po prawej');
  assert.ok(hasPoint(cross, d.cfg.t, 0), 'korpus musi byc cofniety o grubosc boku');
});

test('zaklad przegrody podluznej i poprzecznej spotyka sie w polowie', () => {
  const cfg = {};
  const m = buildStepped(cfg);
  const d = steppedDims(cfg);
  const { lap, t, fit, slotDepth } = d.cfg;
  const slotT = t - fit;
  const cross = partOf(m, 'Przegroda poprzeczna (tylna)');
  const div = partOf(m, 'Przegroda podluzna');
  // przegroda poprzeczna: wpust od dolu na polowe zakladu
  for (const cx of d.divX) {
    assert.ok(hasPoint(cross, cx - slotT / 2, d.panelH - lap / 2), `brak wpustu przy x=${cx}`);
  }
  // przegroda podluzna: wciecie od gory na polowe zakladu, w miejscu przegrod
  const y0 = d.divTopAt(0);
  for (const x of d.crossX) {
    const bottom = d.divTopAt(x + slotT / 2) - y0 + lap / 2;
    assert.ok(hasPoint(div, x, bottom), `brak wciecia zakladu przy x=${x}`);
  }
  // sumarycznie: gora przegrody podluznej lezy o `lap` nad dnem przegrody poprzecznej
  const crossBottom = d.yTop(d.crossX[0]) + slotDepth;
  assert.ok(Math.abs((crossBottom - d.divTopAt(d.crossX[0])) - lap) < TOL);
});

test('numeracja kieszeni jest ciagla i bez powtorzen', () => {
  const m = buildStepped({ sku: 'K-30' });
  const named = m.parts.filter(p => /kieszenie \d+-\d+/.test(p.name));
  assert.equal(named.length, 10);
  const zakresy = named.map(p => p.name.match(/kieszenie (\d+)-(\d+)/).slice(1).map(Number));
  const wszystkie = zakresy.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
  assert.deepEqual(wszystkie, Array.from({ length: 30 }, (_, i) => i + 1));
  for (const p of named) assert.ok(p.engrave.length >= 3, `${p.name}: brak grawerowanych numerow`);
  assert.equal(partOf(m, 'Przegroda poprzeczna (tylna)').engrave.length, 0);
});

test('panel czolowy niesie nazwe szkoly i klase', () => {
  const m = buildStepped({ schoolName: 'SP 7', className: 'Klasa 6b' });
  const front = partOf(m, 'Panel czolowy');
  assert.deepEqual(front.texts.map(t => t.text), ['SP 7', 'Klasa 6b']);
});

test('jedna kolumna nie tworzy przegrod podluznych', () => {
  const m = buildStepped({ sku: 'wlasny', cols: 1, pockets: 5 });
  assert.equal(partOf(m, 'Przegroda podluzna'), undefined);
  assert.equal(partOf(m, 'Podstawa').cut.length, 1, 'podstawa bez wpustow na przegrody');
});

test('wysokosc boku rosnie razem z liczba kieszeni', () => {
  const a = steppedDims({ sku: 'wlasny', pockets: 6 });
  const b = steppedDims({ sku: 'wlasny', pockets: 12 });
  assert.ok(b.D > a.D);
  assert.ok(b.sideH > a.sideH, 'dluzsze schody musza dac wyzszy bok');
});

test('validateSteppedConfig wylapuje niemozliwe ustawienia', () => {
  const err = cfg => validateSteppedConfig(cfg).filter(i => i.level === 'error').map(i => i.msg);
  assert.ok(err({ t: 0 }).length);
  assert.ok(err({ fit: 5 }).length);
  assert.ok(err({ lap: 200 }).length, 'zaklad wiekszy niz przegroda');
  assert.ok(err({ cellW: 20, tabW: 40, tabN: 3 }).length, 'czopy podstawy sie nie miesza');
  assert.equal(err({}).length, 0);
  const warn = validateSteppedConfig({ pocketW: 8 }).filter(i => i.level === 'warn');
  assert.ok(warn.length, 'waska kieszen powinna dac ostrzezenie');
});

test('warianty katalogowe ustawiaja siatke', () => {
  for (const [sku, spec] of Object.entries(STEPPED_SKU)) {
    if (!spec) continue;
    const m = buildStepped({ sku });
    assert.equal(m.cells, spec.cols * spec.pockets, sku);
  }
});

test('model jest deterministyczny', () => {
  assert.equal(JSON.stringify(buildStepped({})), JSON.stringify(buildStepped({})));
  assert.ok(STEPPED_DEFAULTS.pockets > 0);
});
