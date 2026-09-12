// Eksport arkusza do SVG (mm 1:1). Warstwy: CUT, ENGRAVE, TEXT, OPIS.

import { placedSheet } from './layout.js';

export function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

export function shapeToPath(shape) {
  const d = 'M' + shape.pts.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join('L');
  return shape.closed ? d + 'Z' : d;
}

export function sheetSvg(sheet, parts, opts) {
  const { sheetW, sheetH, labels = false, sheetGuide = true } = opts;
  const placed = placedSheet(parts, sheet);
  const cuts = [], engs = [], texts = [];
  for (const part of placed) {
    for (const s of part.cut) cuts.push(shapeToPath(s));
    for (const s of part.engrave) engs.push(shapeToPath(s));
    for (const t of part.texts) texts.push(t);
  }
  const out = [];
  if (sheetGuide) {
    out.push(`<rect id="SHEET" x="0" y="0" width="${sheetW}" height="${sheetH}" fill="none" stroke="#c9c4b8" stroke-width="0.4" stroke-dasharray="4 3"/>`);
  }
  out.push(`<g id="CUT" fill="none" stroke="#111111" stroke-width="0.15">${cuts.map(d => `<path d="${d}"/>`).join('')}</g>`);
  out.push(`<g id="ENGRAVE" fill="none" stroke="#d0021b" stroke-width="0.15">${engs.map(d => `<path d="${d}"/>`).join('')}</g>`);
  out.push(`<g id="TEXT" fill="#d0021b" stroke="none" font-family="Arial, Helvetica, sans-serif">${texts.map(t => {
    const x = t.x.toFixed(2), y = t.y.toFixed(2);
    const tr = t.rot ? ` transform="rotate(${t.rot} ${x} ${y})"` : '';
    return `<text x="${x}" y="${y}" font-size="${t.size}" text-anchor="middle"${tr}>${escapeXml(t.text || '')}</text>`;
  }).join('')}</g>`);
  if (labels) {
    out.push(`<g id="OPIS" fill="#8a857a" stroke="none" font-family="Arial, Helvetica, sans-serif" font-size="6">${placed.map(p =>
      `<text x="${(p.x + 3).toFixed(1)}" y="${(p.y + 8).toFixed(1)}">${escapeXml(p.name)}${p.rot ? ' ↻' : ''}</text>`).join('')}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}mm" height="${sheetH}mm" viewBox="0 0 ${sheetW} ${sheetH}">${out.join('')}</svg>`;
}
