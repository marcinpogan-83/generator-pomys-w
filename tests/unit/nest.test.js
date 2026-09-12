import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../src/model.js';
import { nest, validatePlacement, SORTS, HEURISTICS } from '../../src/nest.js';
import { legacyNest } from '../baseline/legacy-nest.js';

const OPTS = { sheetW: 760, sheetH: 760, margin: 6, gap: 4, allowRot: true };

const CONFIGS = [
  {},
  { sku: 'S-26' },
  { sku: 'S-36' },
  { sku: 'wlasny', cols: 1, rows: 12, cellW: 160 },
  { sku: 'wlasny', cols: 2, rows: 16, cellW: 200, depth: 110 },
  { sku: 'wlasny', cols: 4, rows: 8, cellW: 140 },
  { solidBack: true, solidStiffener: true }
];
const SHEETS = [[760, 760], [1000, 600], [1220, 610]];

function lastSheetBBox(items) {
  let mx = 0, my = 0;
  for (const it of items) { mx = Math.max(mx, it.x + it.w); my = Math.max(my, it.y + it.h); }
  return mx * my;
}

test('rozkroj nie tworzy kolizji ani nie wychodzi poza arkusz', () => {
  for (const cfg of CONFIGS) {
    const parts = build(cfg).parts;
    for (const [w, h] of SHEETS) {
      const opts = { ...OPTS, sheetW: w, sheetH: h };
      const res = nest(parts, opts);
      const problems = validatePlacement(res, opts).filter(p => !res.stats.oversize || p.level !== 'error');
      assert.deepEqual(problems, [], `${JSON.stringify(cfg)} @ ${w}x${h}: ${JSON.stringify(problems)}`);
    }
  }
});

test('wszystkie sztuki trafiaja na arkusze', () => {
  for (const cfg of CONFIGS) {
    const parts = build(cfg).parts;
    const res = nest(parts, OPTS);
    const expected = parts.reduce((a, p) => a + p.qty, 0);
    const placed = res.sheets.reduce((a, s) => a + s.items.length, 0);
    assert.equal(placed, expected, `${JSON.stringify(cfg)}: zgubione czesci`);
    // kazda czesc pojawia sie dokladnie tyle razy, ile wynosi jej naklad
    const count = new Map();
    for (const s of res.sheets) for (const it of s.items) count.set(it.pi, (count.get(it.pi) || 0) + 1);
    parts.forEach((p, i) => assert.equal(count.get(i), p.qty, `${p.name}: zla liczba sztuk`));
  }
});

test('obrocone czesci maja zamienione wymiary', () => {
  const parts = build({}).parts;
  const res = nest(parts, OPTS);
  for (const sheet of res.sheets) {
    for (const it of sheet.items) {
      const p = parts[it.pi];
      const [w, h] = it.rot ? [p.h, p.w] : [p.w, p.h];
      assert.ok(Math.abs(it.w - w) < 1e-9 && Math.abs(it.h - h) < 1e-9, 'wymiary po obrocie');
    }
  }
});

test('blokada obrotu jest respektowana', () => {
  const parts = build({}).parts;
  const res = nest(parts, { ...OPTS, allowRot: false });
  for (const sheet of res.sheets) for (const it of sheet.items) assert.equal(it.rot, false);
});

test('margines i odstep sa zachowane', () => {
  const opts = { ...OPTS, margin: 10, gap: 6 };
  const parts = build({}).parts;
  const res = nest(parts, opts);
  assert.deepEqual(validatePlacement(res, opts), []);
  for (const sheet of res.sheets) {
    for (const it of sheet.items) {
      assert.ok(it.x >= opts.margin - 1e-9 && it.y >= opts.margin - 1e-9);
      assert.ok(it.x + it.w <= opts.sheetW - opts.margin + 1e-9);
      assert.ok(it.y + it.h <= opts.sheetH - opts.margin + 1e-9);
    }
  }
});

test('rozkroj jest deterministyczny', () => {
  const parts = build({}).parts;
  assert.equal(JSON.stringify(nest(parts, OPTS)), JSON.stringify(nest(parts, OPTS)));
});

test('czesc wieksza od arkusza jest oznaczona, a nie cicho przycieta', () => {
  const parts = build({ sku: 'wlasny', cols: 4, rows: 6, cellW: 200 }).parts;
  const opts = { ...OPTS, sheetW: 400, sheetH: 400 };
  const res = nest(parts, opts);
  assert.ok(res.stats.oversize > 0);
  const flagged = res.sheets.flatMap(s => s.items).filter(i => i.oversize);
  assert.equal(flagged.length, res.stats.oversize);
  assert.ok(validatePlacement(res, opts).some(p => p.level === 'error'));
});

test('nowy rozkroj nie jest gorszy od oryginalnego (liczba arkuszy)', () => {
  let better = 0;
  for (const cfg of CONFIGS) {
    const parts = build(cfg).parts;
    for (const [w, h] of SHEETS) {
      const opts = { ...OPTS, sheetW: w, sheetH: h };
      const res = nest(parts, opts);
      if (res.stats.oversize) continue;
      const legacy = legacyNest(parts, w, h, opts.margin, opts.gap, true);
      assert.ok(res.stats.sheetCount <= legacy.length,
        `${JSON.stringify(cfg)} @ ${w}x${h}: ${res.stats.sheetCount} > ${legacy.length}`);
      if (res.stats.sheetCount < legacy.length) better++;
      if (res.stats.sheetCount === legacy.length) {
        const a = lastSheetBBox(legacy[legacy.length - 1].items);
        const b = lastSheetBBox(res.sheets[res.sheets.length - 1].items);
        assert.ok(b <= a + 1, `ostatni arkusz gorzej upakowany: ${b} > ${a}`);
      }
    }
  }
  assert.ok(better > 0, 'nowy algorytm powinien wygrywac w co najmniej jednym przypadku');
});

test('nowy rozkroj wygrywa takze na losowych konfiguracjach', () => {
  let seed = 20240912;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let checked = 0, better = 0;
  for (let i = 0; i < 60; i++) {
    const cfg = {
      sku: 'wlasny', cols: 1 + Math.floor(rnd() * 4), rows: 4 + Math.floor(rnd() * 14),
      cellW: 120 + Math.round(rnd() * 90), cellH: 20 + Math.round(rnd() * 15),
      depth: 70 + Math.round(rnd() * 50), solidBack: rnd() < 0.5, solidStiffener: rnd() < 0.5
    };
    const model = build(cfg);
    if (model.issues.some(p => p.level === 'error')) continue;
    const opts = { ...OPTS, sheetW: 600 + Math.round(rnd() * 700), sheetH: 600 + Math.round(rnd() * 400) };
    const res = nest(model.parts, opts);
    if (res.stats.oversize) continue;
    checked++;
    assert.deepEqual(validatePlacement(res, opts), [], `kolizja dla ${JSON.stringify(cfg)}`);
    const legacy = legacyNest(model.parts, opts.sheetW, opts.sheetH, opts.margin, opts.gap, true);
    assert.ok(res.stats.sheetCount <= legacy.length,
      `${JSON.stringify(cfg)} @ ${opts.sheetW}x${opts.sheetH}: ${res.stats.sheetCount} > ${legacy.length}`);
    if (res.stats.sheetCount < legacy.length) better++;
  }
  assert.ok(checked > 30, 'za malo sprawdzonych przypadkow');
  assert.ok(better > 0, `nowy algorytm nie poprawil zadnego z ${checked} przypadkow`);
});

test('statystyki opisuja wynik', () => {
  const parts = build({}).parts;
  const res = nest(parts, OPTS);
  assert.equal(res.stats.sheetCount, res.sheets.length);
  assert.equal(res.stats.itemCount, parts.reduce((a, p) => a + p.qty, 0));
  assert.ok(res.stats.utilization > 0 && res.stats.utilization <= 1);
  assert.ok(SORTS.includes(res.strategy.sort));
  assert.ok(HEURISTICS.includes(res.strategy.heuristic));
});

test('ograniczenie strategii nadal daje poprawny rozkroj', () => {
  const parts = build({}).parts;
  for (const sort of SORTS) {
    for (const heuristic of HEURISTICS) {
      const opts = { ...OPTS, sorts: [sort], heuristics: [heuristic] };
      const res = nest(parts, opts);
      assert.deepEqual(validatePlacement(res, opts), [], `${sort}/${heuristic}`);
    }
  }
});
