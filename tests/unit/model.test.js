import test from 'node:test';
import assert from 'node:assert/strict';
import { build, validateConfig, applySku, netArea, SKU, DEFAULTS } from '../../src/model.js';
import { shapeSegments } from '../../src/geometry.js';
import { segKey, selfIntersects, boundsOf } from '../helpers/geom.mjs';

const TOL = 1e-6;

function allShapes(part) { return [...part.cut, ...part.engrave]; }

test('domyslna konfiguracja buduje komplet czesci', () => {
  const m = build({});
  const names = m.parts.map(p => p.name);
  assert.ok(names.includes('Bok'));
  assert.ok(names.includes('Plyta gorna / dolna'));
  assert.ok(names.includes('Polka'));
  assert.ok(names.includes('Przegroda pionowa'));
  assert.ok(names.includes('Drzwi'));
  assert.equal(m.cells, 30);
  assert.equal(m.issues.length, 0);
  const bok = m.parts.find(p => p.name === 'Bok');
  assert.equal(bok.qty, 2);
  const polka = m.parts.find(p => p.name === 'Polka');
  assert.equal(polka.qty, 10, 'polek jest tyle, ile przerw miedzy pasami');
});

test('wymiary korpusu wynikaja z siatki przegrodek', () => {
  const cfg = { sku: 'wlasny', cols: 3, rows: 10, cellW: 178, cellH: 25, t: 3, useHeader: true, headerH: 32 };
  const m = build(cfg);
  assert.equal(m.IW, 3 * 178 + 2 * 3);
  assert.equal(m.W, m.IW + 6);
  const bandsH = 32 + 10 * 25 + 10 * 3;
  assert.equal(m.IH, bandsH);
  assert.equal(m.H, bandsH + 6);
});

test('kazdy ksztalt miesci sie w obrysie swojej czesci', () => {
  for (const cfg of [{}, { sku: 'S-26' }, { sku: 'S-36' }, { solidBack: true, solidStiffener: true },
                     { sku: 'wlasny', cols: 1, rows: 6, useHeader: false }]) {
    const m = build(cfg);
    for (const part of m.parts) {
      const b = boundsOf(allShapes(part));
      assert.ok(b.minX >= -TOL, `${part.name}: x < 0`);
      assert.ok(b.minY >= -TOL, `${part.name}: y < 0`);
      assert.ok(b.maxX <= part.w + TOL, `${part.name}: x poza szerokoscia (${b.maxX} > ${part.w})`);
      assert.ok(b.maxY <= part.h + TOL, `${part.name}: y poza wysokoscia (${b.maxY} > ${part.h})`);
      for (const t of part.texts) {
        assert.ok(t.x >= 0 && t.x <= part.w && t.y >= 0 && t.y <= part.h, `${part.name}: tekst poza plyta`);
      }
    }
  }
});

test('zaden kontur ciecia nie przecina sam siebie', () => {
  // Grawer moze sie przecinac (np. jednokreskowa cyfra 4), ale sciezka ciecia
  // nigdy - to gwarantuje, ze wycinany element nie rozpada sie na kawalki.
  for (const cfg of [{}, { solidBack: true }, { sku: 'S-36' }]) {
    const m = build(cfg);
    for (const part of m.parts) {
      for (const s of part.cut) {
        assert.equal(selfIntersects(s), false, `${part.name}: kontur ciecia przecina sam siebie`);
      }
    }
  }
});

test('brak podwojnych ciec - zaden odcinek nie powtarza sie w czesci', () => {
  for (const cfg of [{}, { solidBack: true, solidStiffener: true }]) {
    const m = build(cfg);
    for (const part of m.parts) {
      const seen = new Set();
      for (const s of part.cut) {
        for (const [a, b] of shapeSegments(s)) {
          const k = segKey(a, b);
          assert.ok(!seen.has(k), `${part.name}: powtorzony odcinek ciecia ${k}`);
          seen.add(k);
        }
      }
    }
  }
});

test('gniazda w bokach odpowiadaja czopom plyt poziomych', () => {
  const cfg = { sku: 'wlasny', cols: 2, rows: 4, t: 3, fit: 0.15, tabN: 3, tabW: 18, depth: 90 };
  const m = build(cfg);
  const bok = m.parts.find(p => p.name === 'Bok');
  const bands = m.bands.length;
  // 1 obrys + (liczba plyt poziomych) * tabN gniazd
  assert.equal(bok.cut.length, 1 + (bands + 1) * cfg.tabN);
  const slot = bok.cut[1];
  const b = boundsOf([slot]);
  assert.ok(Math.abs((b.maxY - b.minY) - (cfg.t - cfg.fit)) < TOL, 'gniazdo ma grubosc t - fit');
  assert.ok(Math.abs((b.maxX - b.minX) - (cfg.tabW + 0.2)) < TOL, 'gniazdo ma luz 0,2 mm na dlugosci');
});

test('drzwi maja numer i szczeline dla kazdej przegrodki', () => {
  const m = build({ sku: 'wlasny', cols: 3, rows: 4, useHeader: true });
  const drzwi = m.parts.find(p => p.name === 'Drzwi');
  // 1 obrys + 12 szczelin
  assert.equal(drzwi.cut.length, 1 + 12);
  assert.equal(drzwi.texts.length, 2, 'naglowek: nazwa szkoly + klasa');
  assert.ok(drzwi.engrave.length > 12, 'numery przegrodek grawerowane kreskowo');
});

test('numery drzwi moga byc tekstem w wybranej czcionce', () => {
  const stroke = build({ sku: 'wlasny', cols: 2, rows: 3, useHeader: false });
  const font = build({ sku: 'wlasny', cols: 2, rows: 3, useHeader: false,
                       numStyle: 'czcionka', fontFamily: 'Times New Roman', numSize: 9 });
  const a = stroke.parts.find(p => p.name === 'Drzwi');
  const b = font.parts.find(p => p.name === 'Drzwi');
  assert.ok(a.engrave.length > 6 && a.texts.length === 0);
  assert.equal(b.texts.length, 6, 'szesc przegrodek = szesc numerow');
  for (const t of b.texts) {
    assert.equal(t.font, 'Times New Roman');
    assert.equal(t.size, 9);
  }
  // same znaczniki zawiasow i skobla zostaja wektorem
  assert.equal(b.engrave.length, 3);
});

test('czcionka trafia takze do naglowka drzwi', () => {
  const m = build({ useHeader: true, fontFamily: 'Verdana' });
  const drzwi = m.parts.find(p => p.name === 'Drzwi');
  for (const t of drzwi.texts) assert.equal(t.font, 'Verdana');
});

test('bez naglowka nie ma tekstow na drzwiach', () => {
  const m = build({ useHeader: false });
  const drzwi = m.parts.find(p => p.name === 'Drzwi');
  assert.equal(drzwi.texts.length, 0);
});

test('jedna kolumna nie tworzy przegrody pionowej', () => {
  const m = build({ sku: 'wlasny', cols: 1, rows: 5 });
  assert.equal(m.parts.find(p => p.name === 'Przegroda pionowa'), undefined);
});

test('opcje konstrukcyjne zmieniaja liste czesci', () => {
  const a = build({ solidBack: false, solidStiffener: false }).parts.map(p => p.name);
  const b = build({ solidBack: true, solidStiffener: true }).parts.map(p => p.name);
  assert.ok(a.includes('Listwa tylna (z otworami kluczowymi)'));
  assert.ok(b.includes('Plecy (pelne)'));
  assert.ok(b.includes('Ramka wzmacniajaca drzwi'));
});

test('validateConfig wylapuje niemozliwe ustawienia', () => {
  const err = cfg => validateConfig(cfg).filter(i => i.level === 'error').map(i => i.msg);
  assert.ok(err({ fit: 5, t: 3 }).length, 'kompensacja wieksza od grubosci');
  assert.ok(err({ t: 0 }).length, 'zerowa grubosc');
  assert.ok(err({ depth: 40, tabN: 3, tabW: 18 }).length, 'czopy nie miesza sie na glebokosci');
  assert.ok(err({ slitW: 30, cellH: 25 }).length, 'szczelina wyzsza niz przegrodka');
  assert.ok(err({ numStyle: 'inny' }).length, 'nieznany styl numeru');
  assert.ok(err({ numStyle: 'czcionka', fontFamily: '' }).length, 'brak nazwy czcionki');
  assert.equal(err({}).length, 0);
});

test('applySku nadpisuje siatke wariantem katalogowym', () => {
  assert.deepEqual(
    [applySku({ sku: 'S-36' }).cols, applySku({ sku: 'S-36' }).rows],
    [SKU['S-36'].cols, SKU['S-36'].rows]);
  const own = applySku({ sku: 'wlasny', cols: 5, rows: 7 });
  assert.equal(own.cols, 5);
  assert.equal(own.rows, 7);
});

test('netArea liczy pole wszystkich sztuk', () => {
  const m = build({});
  const manual = m.parts.reduce((a, p) => a + p.qty * p.w * p.h, 0) / 1e6;
  assert.ok(Math.abs(netArea(m) - manual) < 1e-12);
  assert.ok(netArea(m) > 0.5 && netArea(m) < 2);
});

test('model jest deterministyczny', () => {
  const a = JSON.stringify(build({ sku: 'S-30' }));
  const b = JSON.stringify(build({ sku: 'S-30' }));
  assert.equal(a, b);
});

test('domyslne wartosci sa kompletne', () => {
  for (const k of ['t', 'fit', 'cols', 'rows', 'cellW', 'cellH', 'depth', 'tabN', 'tabW']) {
    assert.ok(DEFAULTS[k] !== undefined, `brak domyslnej wartosci ${k}`);
  }
});
