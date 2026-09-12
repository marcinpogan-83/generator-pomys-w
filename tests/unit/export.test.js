import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../src/model.js';
import { nest } from '../../src/nest.js';
import { sheetSvg, shapeToPath, escapeXml } from '../../src/svg.js';
import { sheetDxf, sheetManifest, DXF_VERSION } from '../../src/dxf.js';
import { placedSheet } from '../../src/layout.js';
import { parseTags, sections, entities, layerOf, isClosed, tagValue } from '../helpers/dxf.mjs';

const OPTS = { sheetW: 760, sheetH: 760, margin: 6, gap: 4, allowRot: true };

function fixture(cfg = {}) {
  const model = build(cfg);
  const nested = nest(model.parts, OPTS);
  return { model, nested };
}

test('SVG: naglowek, jednostki i warstwy', () => {
  const { model, nested } = fixture();
  const svg = sheetSvg(nested.sheets[0], model.parts, OPTS);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes(`width="${OPTS.sheetW}mm"`));
  assert.ok(svg.includes(`viewBox="0 0 ${OPTS.sheetW} ${OPTS.sheetH}"`));
  assert.ok(svg.includes('id="CUT"'));
  assert.ok(svg.includes('id="ENGRAVE"'));
  assert.ok(svg.includes('id="TEXT"'));
  assert.equal(svg.split('<svg').length - 1, 1);
});

test('SVG: liczba sciezek zgadza sie z modelem, a otwarte nie sa domykane', () => {
  const { model, nested } = fixture();
  for (const sheet of nested.sheets) {
    const svg = sheetSvg(sheet, model.parts, OPTS);
    const man = sheetManifest(sheet, model.parts, OPTS);
    const cutGroup = svg.match(/<g id="CUT"[^>]*>(.*?)<\/g>/s)[1];
    const engGroup = svg.match(/<g id="ENGRAVE"[^>]*>(.*?)<\/g>/s)[1];
    assert.equal((cutGroup.match(/<path /g) || []).length, man.counts.polylinesCut);
    assert.equal((engGroup.match(/<path /g) || []).length, man.counts.polylinesEngrave);
    assert.equal((cutGroup.match(/Z"/g) || []).length, man.counts.polylinesCutClosed);
    assert.equal((engGroup.match(/Z"/g) || []).length, man.counts.polylinesEngraveClosed);
  }
});

test('SVG: tekst jest escapowany', () => {
  const { model, nested } = fixture({ schoolName: 'SP "1" & <2>', useHeader: true });
  const svg = nested.sheets.map(s => sheetSvg(s, model.parts, OPTS)).join('');
  assert.ok(svg.includes('SP &quot;1&quot; &amp; &lt;2&gt;'));
  assert.equal(escapeXml("a&b"), 'a&amp;b');
});

test('shapeToPath domyka tylko kontury zamkniete', () => {
  assert.equal(shapeToPath({ pts: [[0, 0], [1, 1]], closed: false }), 'M0.000,0.000L1.000,1.000');
  assert.equal(shapeToPath({ pts: [[0, 0], [1, 1]], closed: true }), 'M0.000,0.000L1.000,1.000Z');
});

test('DXF: komplet sekcji i wersja R12', () => {
  const { model, nested } = fixture();
  const dxf = sheetDxf(nested.sheets[0], model.parts, OPTS);
  const tags = parseTags(dxf);
  assert.equal(tags.length % 1, 0);
  const sec = sections(tags);
  for (const name of ['HEADER', 'TABLES', 'ENTITIES']) assert.ok(sec[name], `brak sekcji ${name}`);
  assert.equal(tags[tags.length - 1][1], 'EOF');
  const header = sec.HEADER.map(t => t[1]);
  assert.ok(header.includes(DXF_VERSION));
  const insunits = sec.HEADER.findIndex(t => t[1] === '$INSUNITS');
  assert.equal(sec.HEADER[insunits + 1][1], '4', 'jednostki musza byc w milimetrach');
});

test('DXF: warstwy CUT i ENGRAVE sa zdefiniowane w tablicy warstw', () => {
  const { model, nested } = fixture();
  const sec = sections(parseTags(sheetDxf(nested.sheets[0], model.parts, OPTS)));
  const names = sec.TABLES.filter((t, i) => t[0] === 2).map(t => t[1]);
  assert.ok(names.includes('CUT'));
  assert.ok(names.includes('ENGRAVE'));
  assert.ok(names.includes('STANDARD'), 'styl tekstu musi istniec');
});

test('DXF: liczba i rodzaj encji odpowiada manifestowi', () => {
  const { model, nested } = fixture();
  for (const sheet of nested.sheets) {
    const man = sheetManifest(sheet, model.parts, OPTS);
    const ents = entities(sections(parseTags(sheetDxf(sheet, model.parts, OPTS))).ENTITIES);
    const poly = ents.filter(e => e.type === 'POLYLINE');
    const texts = ents.filter(e => e.type === 'TEXT');
    assert.equal(poly.filter(e => layerOf(e) === 'CUT').length, man.counts.polylinesCut);
    assert.equal(poly.filter(e => layerOf(e) === 'ENGRAVE').length, man.counts.polylinesEngrave);
    assert.equal(texts.length, man.counts.texts);
    assert.equal(poly.filter(e => layerOf(e) === 'CUT' && isClosed(e)).length, man.counts.polylinesCutClosed);
    assert.equal(poly.filter(e => layerOf(e) === 'ENGRAVE' && !isClosed(e)).length, man.counts.polylinesEngraveOpen);
    for (const e of ents) assert.ok(['CUT', 'ENGRAVE'].includes(layerOf(e)), `encja na warstwie ${layerOf(e)}`);
  }
});

test('DXF: os Y jest odbita wzgledem wysokosci arkusza', () => {
  const { model, nested } = fixture();
  const sheet = nested.sheets[0];
  const placed = placedSheet(model.parts, sheet);
  const ents = entities(sections(parseTags(sheetDxf(sheet, model.parts, OPTS))).ENTITIES);
  const first = ents.find(e => e.type === 'POLYLINE');
  const shape = placed[0].cut[0];
  assert.equal(first.vertices.length, shape.pts.length);
  shape.pts.forEach((p, i) => {
    assert.ok(Math.abs(first.vertices[i].x - p[0]) < 1e-3, 'x bez zmian');
    assert.ok(Math.abs(first.vertices[i].y - (OPTS.sheetH - p[1])) < 1e-3, 'y odbite');
  });
});

test('DXF: cala geometria miesci sie w arkuszu', () => {
  const { model, nested } = fixture();
  for (const sheet of nested.sheets) {
    const ents = entities(sections(parseTags(sheetDxf(sheet, model.parts, OPTS))).ENTITIES);
    for (const e of ents) {
      for (const v of e.vertices) {
        assert.ok(v.x >= -1e-6 && v.x <= OPTS.sheetW + 1e-6, `x poza arkuszem: ${v.x}`);
        assert.ok(v.y >= -1e-6 && v.y <= OPTS.sheetH + 1e-6, `y poza arkuszem: ${v.y}`);
      }
    }
  }
});

test('DXF: tekst naglowka trafia do pliku z wysokoscia i wyrownaniem', () => {
  const { model, nested } = fixture({ useHeader: true, schoolName: 'SP nr 7', className: 'Klasa 6b' });
  const found = [];
  for (const sheet of nested.sheets) {
    const ents = entities(sections(parseTags(sheetDxf(sheet, model.parts, OPTS))).ENTITIES);
    for (const e of ents.filter(x => x.type === 'TEXT')) {
      found.push(tagValue(e, 1));
      assert.ok(Number(tagValue(e, 40)) > 0, 'wysokosc tekstu');
      assert.equal(tagValue(e, 72), '1', 'wyrownanie do srodka');
      assert.equal(layerOf(e), 'ENGRAVE');
    }
  }
  assert.deepEqual(found.sort(), ['Klasa 6b', 'SP nr 7']);
});

test('DXF obroconej czesci obraca takze tekst', () => {
  const model = build({ useHeader: true });
  const nested = nest(model.parts, { ...OPTS, sheetW: 900, sheetH: 700 });
  const withText = nested.sheets.map((s, i) => ({ s, i, man: sheetManifest(s, model.parts, OPTS) }))
    .find(x => x.man.counts.texts > 0);
  const rotated = withText.s.items.find(it => it.rot && model.parts[it.pi].texts.length);
  const ents = entities(sections(parseTags(sheetDxf(withText.s, model.parts, OPTS))).ENTITIES)
    .filter(e => e.type === 'TEXT');
  for (const e of ents) {
    const angle = Number(tagValue(e, 50));
    assert.ok(angle === 0 || Math.abs(angle - 270) < 1e-6, `kat tekstu ${angle}`);
    if (rotated) assert.ok(Math.abs(angle - 270) < 1e-6, 'tekst na obroconej czesci musi byc obrocony');
  }
});

test('manifest opisuje rozmieszczenie czesci', () => {
  const { model, nested } = fixture();
  const man = sheetManifest(nested.sheets[0], model.parts, OPTS);
  assert.equal(man.parts.length, nested.sheets[0].items.length);
  assert.equal(man.sheetW, OPTS.sheetW);
  assert.ok(man.bounds.minX >= OPTS.margin - 1e-9);
  for (const p of man.parts) assert.ok(model.parts.some(mp => mp.name === p.name));
});
