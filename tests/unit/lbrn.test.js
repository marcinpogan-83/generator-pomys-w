import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, modelDefaults } from '../../src/models.js';
import { nest } from '../../src/nest.js';
import { sheetLbrn, LBRN_LAYERS } from '../../src/lbrn.js';
import { sheetManifest } from '../../src/dxf.js';
import { placedSheet } from '../../src/layout.js';

const OPTS = { sheetW: 760, sheetH: 760, margin: 6, gap: 4, allowRot: true };

function fixture(type = 'rack', extra = {}) {
  const model = buildModel(type, { ...modelDefaults(type), ...extra });
  const nested = nest(model.parts, OPTS);
  return { model, nested };
}

const shapes = (xml) => [...xml.matchAll(/<Shape Type="(\w+)" CutIndex="(\d)"/g)].map(m => [m[1], m[2]]);

test('projekt LightBurn ma naglowek i obie warstwy', () => {
  const { model, nested } = fixture();
  const xml = sheetLbrn(nested.sheets[0], model.parts, OPTS);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<LightBurnProject'));
  assert.ok(xml.trimEnd().endsWith('</LightBurnProject>'));
  for (const l of LBRN_LAYERS) {
    assert.ok(xml.includes(`<name Value="${l.name}"/>`), `brak warstwy ${l.name}`);
  }
  assert.equal((xml.match(/<CutSetting /g) || []).length, LBRN_LAYERS.length);
});

test('liczba ksztaltow zgadza sie z manifestem', () => {
  for (const type of ['secure', 'rack']) {
    const { model, nested } = fixture(type);
    for (const sheet of nested.sheets) {
      const xml = sheetLbrn(sheet, model.parts, OPTS);
      const man = sheetManifest(sheet, model.parts, OPTS);
      const list = shapes(xml);
      assert.equal(list.filter(s => s[0] === 'Path' && s[1] === '0').length, man.counts.polylinesCut, type);
      assert.equal(list.filter(s => s[0] === 'Path' && s[1] === '1').length, man.counts.polylinesEngrave, type);
      assert.equal(list.filter(s => s[0] === 'Text').length, man.counts.texts, type);
    }
  }
});

test('kontury zamkniete domykaja liste odcinkow, otwarte nie', () => {
  const { model, nested } = fixture();
  const xml = sheetLbrn(nested.sheets[0], model.parts, OPTS);
  const blocks = [...xml.matchAll(/<VertList>(.*?)<\/VertList>\n    <PrimList>(.*?)<\/PrimList>/gs)];
  assert.ok(blocks.length > 0);
  let closed = 0, open = 0;
  for (const [, verts, prims] of blocks) {
    const n = (verts.match(/V/g) || []).length;
    const segs = (prims.match(/L/g) || []).length;
    assert.ok(n >= 2);
    if (segs === n) closed++;
    else if (segs === n - 1) open++;
    else assert.fail(`liczba odcinkow ${segs} nie pasuje do ${n} punktow`);
    const last = prims.match(/L(\d+) (\d+)$/);
    if (segs === n) assert.deepEqual(last.slice(1), [String(n - 1), '0'], 'domkniecie musi wracac do punktu 0');
  }
  const man = sheetManifest(nested.sheets[0], model.parts, OPTS);
  assert.equal(closed, man.counts.polylinesCutClosed + man.counts.polylinesEngraveClosed);
  assert.equal(open, man.counts.polylinesCutOpen + man.counts.polylinesEngraveOpen);
});

test('os Y jest odbita, a geometria miesci sie w arkuszu', () => {
  const { model, nested } = fixture();
  const sheet = nested.sheets[0];
  const xml = sheetLbrn(sheet, model.parts, OPTS);
  const placed = placedSheet(model.parts, sheet);
  const firstPt = placed[0].cut[0].pts[0];
  const verts = [...xml.matchAll(/V([-\d.]+) ([-\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.ok(verts.some(([x, y]) =>
    Math.abs(x - firstPt[0]) < 0.01 && Math.abs(y - (OPTS.sheetH - firstPt[1])) < 0.01),
    'pierwszy punkt czesci musi trafic do pliku z odbita osia Y');
  for (const [x, y] of verts) {
    assert.ok(x >= -0.01 && x <= OPTS.sheetW + 0.01 && y >= -0.01 && y <= OPTS.sheetH + 0.01);
  }
});

test('tekst trafia do pliku z trescia i wysokoscia', () => {
  const { model, nested } = fixture('rack', { schoolName: 'SP "Pod Debem" & 7', className: 'Klasa 6b' });
  const xml = nested.sheets.map(s => sheetLbrn(s, model.parts, OPTS)).join('');
  assert.ok(xml.includes('Str="SP &quot;Pod Debem&quot; &amp; 7"'), 'tekst musi byc escapowany');
  assert.ok(xml.includes('Str="Klasa 6b"'));
  assert.ok(/H="\d/.test(xml));
});

test('plik jest poprawnym XML-em (parser przegladarkowy w Node)', () => {
  const { model, nested } = fixture();
  const xml = sheetLbrn(nested.sheets[0], model.parts, OPTS);
  // prosta kontrola parzystosci znacznikow: kazdy <Shape ...> ma </Shape>
  assert.equal((xml.match(/<Shape /g) || []).length, (xml.match(/<\/Shape>/g) || []).length);
  assert.equal((xml.match(/<CutSetting /g) || []).length, (xml.match(/<\/CutSetting>/g) || []).length);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), 'niezaescapowany znak &');
});
