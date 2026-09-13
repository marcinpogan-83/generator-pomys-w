// Eksport arkusza do projektu LightBurn (.lbrn2).
//
// Plik jest XML-em: dwie warstwy (0 = ciecie, 1 = grawer), ksztalty jako
// sciezki (VertList + PrimList) i teksty jako encje Text. Uklad wspolrzednych
// LightBurn ma os Y skierowana w gore, wiec - tak jak w DXF - odbijamy Y
// wzgledem wysokosci arkusza.

import { placedSheet } from './layout.js';

export const LBRN_APP_VERSION = '1.4.00';

export const LBRN_LAYERS = [
  { index: 0, name: 'CUT', type: 'Cut', speed: 24, maxPower: 32.5 },
  { index: 1, name: 'ENGRAVE', type: 'Cut', speed: 250, maxPower: 18 }
];

function esc(s) {
  return String(s).replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function num(v) {
  return Number(v).toFixed(4).replace(/\.?0+$/, '') || '0';
}

function cutSetting(layer) {
  return [
    `  <CutSetting type="${layer.type}">`,
    `    <index Value="${layer.index}"/>`,
    `    <name Value="${esc(layer.name)}"/>`,
    `    <maxPower Value="${layer.maxPower}"/>`,
    `    <minPower Value="${layer.maxPower}"/>`,
    `    <speed Value="${layer.speed}"/>`,
    `    <priority Value="${layer.index}"/>`,
    '  </CutSetting>'
  ].join('\n');
}

function pathShape(shape, cutIndex, fy) {
  const pts = shape.pts;
  if (pts.length < 2) return null;
  const verts = pts.map(([x, y]) => `V${num(x)} ${num(fy(y))}`).join('');
  const prims = [];
  for (let i = 0; i < pts.length - 1; i++) prims.push(`L${i} ${i + 1}`);
  if (shape.closed) prims.push(`L${pts.length - 1} 0`);
  return [
    `  <Shape Type="Path" CutIndex="${cutIndex}">`,
    '    <XForm>1 0 0 1 0 0</XForm>',
    `    <VertList>${verts}</VertList>`,
    `    <PrimList>${prims.join('')}</PrimList>`,
    '  </Shape>'
  ].join('\n');
}

function textShape(t, cutIndex, fy) {
  const rot = t.rot ? (360 - t.rot) * Math.PI / 180 : 0;
  const cos = Math.cos(rot).toFixed(6), sin = Math.sin(rot).toFixed(6);
  return [
    `  <Shape Type="Text" CutIndex="${cutIndex}" Font="${esc(t.font || 'Arial')},-1,100,5,50,0,0,0,0,0"`,
    `         Str="${esc(t.text == null ? '' : t.text)}" H="${num(t.size)}" LS="0" LnS="0" Ah="1" Av="1">`,
    `    <XForm>${cos} ${sin} ${-sin} ${cos} ${num(t.x)} ${num(fy(t.y))}</XForm>`,
    '  </Shape>'
  ].join('\n');
}

/**
 * Arkusz -> projekt LightBurn.
 * @param {Object} sheet wynik nest()
 * @param {Array} parts czesci modelu
 * @param {Object} opts {sheetW, sheetH}
 */
export function sheetLbrn(sheet, parts, opts) {
  const { sheetH } = opts;
  const fy = (y) => sheetH - y;
  const placed = placedSheet(parts, sheet);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<LightBurnProject AppVersion="${LBRN_APP_VERSION}" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False">`,
    ...LBRN_LAYERS.map(cutSetting)
  ];
  for (const part of placed) {
    for (const s of part.cut) { const x = pathShape(s, 0, fy); if (x) out.push(x); }
    for (const s of part.engrave) { const x = pathShape(s, 1, fy); if (x) out.push(x); }
    for (const t of part.texts) out.push(textShape(t, 1, fy));
  }
  out.push('</LightBurnProject>', '');
  return out.join('\n');
}
