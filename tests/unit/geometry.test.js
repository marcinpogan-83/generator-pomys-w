import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupe, ring, path, rectPath, panelOutline, tabSpans, keyhole, strokeNumber,
  shapeArea, shapeBounds, shapeSegments, rotateShape90, translateShape, GLYPHS
} from '../../src/geometry.js';
import { selfIntersects } from '../helpers/geom.mjs';

test('dedupe usuwa powtorzone punkty i domkniecie konturu', () => {
  assert.deepEqual(dedupe([[0, 0], [0, 0], [1, 0], [1, 0], [0, 0]], true), [[0, 0], [1, 0]]);
  assert.deepEqual(dedupe([[0, 0], [1, 0], [0, 0]], false), [[0, 0], [1, 0], [0, 0]]);
});

test('rectPath: cztery punkty, poprawne pole i zakres', () => {
  const r = rectPath(10, 20, 30, 40);
  assert.equal(r.pts.length, 4);
  assert.equal(r.closed, true);
  assert.equal(shapeArea(r), 1200);
  assert.deepEqual(shapeBounds(r), { minX: 10, minY: 20, maxX: 40, maxY: 60 });
});

test('tabSpans rozklada czopy rownomiernie', () => {
  const spans = tabSpans(90, 3, 18);
  assert.equal(spans.length, 3);
  const gaps = [spans[0].start, spans[1].start - (spans[0].start + 18), 90 - (spans[2].start + 18)];
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1e-9, 'odstepy musza byc rowne');
  assert.ok(spans[2].start + 18 <= 90);
});

test('tabSpans zwraca pusta liste, gdy czopy sie nie miesza', () => {
  assert.deepEqual(tabSpans(50, 3, 18), []);
  assert.deepEqual(tabSpans(90, 0, 18), []);
});

test('panelOutline: czopy wystaja dokladnie o grubosc materialu', () => {
  const t = 3, w = 200, h = 90;
  const o = panelOutline(w, h, t, { top: null, bottom: null, left: { n: 2, w: 20 }, right: { n: 2, w: 20 } });
  const b = shapeBounds(o);
  assert.equal(b.minX, -t);
  assert.equal(b.maxX, w + t);
  assert.equal(b.minY, 0);
  assert.equal(b.maxY, h);
  // pole = plyta + 4 czopy
  assert.ok(Math.abs(shapeArea(o) - (w * h + 4 * 20 * t)) < 1e-9);
  assert.equal(selfIntersects(o), false);
});

test('panelOutline bez czopow to zwykly prostokat', () => {
  const o = panelOutline(100, 50, 3, { top: null, bottom: null, left: null, right: null });
  assert.equal(o.pts.length, 4);
  assert.equal(shapeArea(o), 5000);
});

test('keyhole to jeden zamkniety kontur bez samoprzeciec', () => {
  const dHead = 9, dShank = 4.5, drop = 14;
  const k = keyhole(50, 30, dHead, dShank, drop);
  assert.equal(k.closed, true);
  assert.equal(selfIntersects(k), false);
  const b = shapeBounds(k);
  assert.ok(Math.abs(b.minY - (30 - dHead / 2)) < 1e-9);
  assert.ok(Math.abs(b.maxY - (30 + drop)) < 1e-9);
  assert.ok(Math.abs(b.minX - (50 - dHead / 2)) < 1e-6);
  assert.ok(Math.abs(b.maxX - (50 + dHead / 2)) < 1e-6);
  // pole = kolo - odcinek pod cieciwa + rowek ponizej cieciwy
  const r = dHead / 2, s = dShank / 2;
  const aCut = Math.acos(s / r);
  const theta = Math.PI - 2 * aCut;                    // kat odcinka kola
  const seg = (r * r / 2) * (theta - Math.sin(theta));
  const yInt = r * Math.sin(aCut);
  const expected = Math.PI * r * r - seg + dShank * (drop - yInt);
  assert.ok(Math.abs(shapeArea(k) - expected) / expected < 0.01,
    `pole ${shapeArea(k).toFixed(2)} != ${expected.toFixed(2)}`);
});

test('cyfry sa polilinami otwartymi (poza zerem)', () => {
  const one = strokeNumber(1, 0, 0, 16);
  assert.equal(one.length, 1);
  assert.equal(one[0].closed, false);
  const zero = strokeNumber(0, 0, 0, 16);
  assert.equal(zero[0].closed, true);
  for (const [ch, strokes] of Object.entries(GLYPHS)) {
    for (const s of strokes) assert.ok(s.pts.length >= 2, `glif ${ch} musi miec odcinek`);
  }
});

test('strokeNumber skaluje i centruje numer', () => {
  const size = 11;
  const shapes = strokeNumber(12, 100, 0, size);
  const xs = shapes.flatMap(s => s.pts.map(p => p[0]));
  const ys = shapes.flatMap(s => s.pts.map(p => p[1]));
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  assert.ok(Math.abs(mid - 100) < size, 'numer w okolicy zadanego srodka');
  assert.ok(Math.max(...ys) - Math.min(...ys) <= size, 'wysokosc nie przekracza rozmiaru');
});

test('rotacja o 90 stopni zachowuje pole i zamienia wymiary', () => {
  const r = rectPath(0, 0, 30, 10);
  const rot = rotateShape90(r, 10);
  assert.ok(Math.abs(shapeArea(rot) - shapeArea(r)) < 1e-9);
  const b = shapeBounds(rot);
  assert.ok(Math.abs(b.maxX - b.minX - 10) < 1e-9);
  assert.ok(Math.abs(b.maxY - b.minY - 30) < 1e-9);
});

test('translateShape przesuwa wszystkie punkty', () => {
  const b = shapeBounds(translateShape(rectPath(0, 0, 10, 10), 5, -5));
  assert.deepEqual(b, { minX: 5, minY: -5, maxX: 15, maxY: 5 });
});

test('shapeSegments domyka tylko kontury zamkniete', () => {
  assert.equal(shapeSegments(ring([[0, 0], [1, 0], [1, 1]])).length, 3);
  assert.equal(shapeSegments(path([[0, 0], [1, 0], [1, 1]])).length, 2);
});
